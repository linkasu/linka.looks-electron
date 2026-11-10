import { app, Tray, Menu, screen, nativeImage } from "electron";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { access, writeFile, unlink } from "node:fs/promises";
import { BubbleController } from "./controller";
import { BubblePreferencesStore } from "./preferences";
import { assertPrivateBubbleDirectory, serveBubbleControl } from "./controlChannel";
import { bubbleInstallationId, openBubbleSettings } from "./client";
import { BubbleTrackerProcess } from "./trackerProcess";
import { createBubbleOverlay } from "./overlayWindow";
import { GazePresentation } from "../../common/bubble/gazePresentation";
import { DEFAULT_BUBBLE_PREFERENCES, type BubblePreferences } from "../../common/bubble/contract";

export async function startBubbleAgent() {
  await app.whenReady();
  const directory = app.getPath("userData");
  await assertPrivateBubbleDirectory(directory);
  const resourceRoot = app.isPackaged ? process.resourcesPath : app.getAppPath();
  const executable = join(
    resourceRoot,
    "extraResources",
    "bubble-backend",
    "Linka.TobiiBackend.exe"
  );
  const presentation = new GazePresentation();
  let preferences: BubblePreferences = { ...DEFAULT_BUBBLE_PREFERENCES };
  let tracker: BubbleTrackerProcess | undefined;
  let backendReady = false;
  let transition = Promise.resolve();
  let polling = false;
  let stopping = false;
  let allowQuit = false;
  let retry: NodeJS.Timeout | undefined;
  let retryCount = 0;
  let generation = 0;
  const resources: { tray?: Tray; timer?: NodeJS.Timeout; closeControl?: () => Promise<void> } = {};

  const overlay = await createBubbleOverlay(
    async () => presentation.frame(preferences, performance.now()),
    () => {
      ++generation;
      presentation.reset();
    }
  );
  overlay.webContents.on("render-process-gone", () => {
    presentation.reset();
    overlay.hide();
    controller.runtime("unavailable", false, "OVERLAY_FAILED");
    app.quit();
  });

  const controller = new BubbleController(
    new BubblePreferencesStore(
      join(directory, "preferences.json"),
      process.env.LOCALAPPDATA
        ? join(process.env.LOCALAPPDATA, "LINKa", "Bubble", "settings.json")
        : undefined
    ),
    apply
  );

  app.on("before-quit", (event) => {
    if (allowQuit) return;
    event.preventDefault();
    if (stopping) return;
    stopping = true;
    clearInterval(resources.timer);
    clearTimeout(retry);
    hide();
    void (async () => {
      await controller.stop();
      await transition;
      if (tracker) await tracker.stop();
      await resources.closeControl?.();
      resources.tray?.destroy();
      if (!overlay.isDestroyed()) overlay.destroy();
      allowQuit = true;
      app.quit();
    })().catch(() => {
      stopping = false;
      controller.runtime("unavailable", false, "BACKEND_STOP_TIMEOUT");
    });
  });

  function hide() {
    presentation.reset();
    if (!overlay.isDestroyed()) overlay.hide();
  }

  function apply(next: BubblePreferences) {
    const changed = preferences.enabled !== next.enabled;
    preferences = next;
    if (!next.enabled) hide();
    if (changed || (next.enabled && !tracker)) reconcile();
  }

  function reconcile() {
    transition = transition
      .then(async () => {
        if (stopping) return;
        if (!preferences.enabled) {
          clearTimeout(retry);
          retry = undefined;
          const previous = tracker;
          backendReady = false;
          ++generation;
          if (previous) await previous.stop();
          tracker = undefined;
          controller.runtime("not-requested", false);
          return;
        }
        if (tracker && backendReady) return;
        if (tracker) {
          clearTimeout(retry);
          retry = undefined;
          await tracker.stop();
          tracker = undefined;
        }
        try {
          await access(executable);
        } catch {
          controller.runtime("unavailable", false, "BACKEND_MISSING");
          return;
        }
        controller.runtime("connecting", false);
        const source = new BubbleTrackerProcess(executable, (code) => failed(source, code));
        tracker = source;
        backendReady = false;
        ++generation;
        presentation.reset();
        try {
          const hello = await source.request("hello");
          if (hello.status === "legacy-conflict") {
            await source.stop();
            tracker = undefined;
            controller.runtime("legacy-conflict", false, "LEGACY_CONFLICT");
          } else {
            backendReady = true;
            controller.runtime(hello.status, false, hello.errorCode);
          }
        } catch {
          failed(source, "BACKEND_START_FAILED");
        }
      })
      .catch(() => {
        hide();
        controller.runtime("unavailable", false, "BACKEND_STOP_TIMEOUT");
      });
  }

  function failed(source: BubbleTrackerProcess, code: string) {
    if (stopping || !preferences.enabled || tracker !== source) return;
    backendReady = false;
    hide();
    controller.runtime("unavailable", false, code);
    if (retry) return;
    retry = setTimeout(
      () => {
        retry = undefined;
        transition = transition
          .then(async () => {
            if (tracker !== source || stopping) return;
            await source.stop();
            tracker = undefined;
            if (preferences.enabled) reconcile();
          })
          .catch(() => controller.runtime("unavailable", false, "BACKEND_STOP_TIMEOUT"));
      },
      Math.min(30000, 1000 * 2 ** Math.min(retryCount++, 5))
    );
  }

  await controller.initialize();
  if (stopping) return;
  const iconPath = app.isPackaged
    ? join(resourceRoot, "extraResources", "bubble.ico")
    : join(resourceRoot, "build", "icons", "icon.ico");
  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) throw new Error("TRAY_ICON_MISSING");
  const activeTray = new Tray(icon);
  resources.tray = activeTray;
  activeTray.setToolTip("LINKa Bubble — точка взгляда");
  activeTray.on("double-click", openBubbleSettings);
  controller.watch((state) => {
    const labels = {
      "not-requested": "Пузырёк скрыт",
      connecting: "Подключаемся",
      tracking: "Взгляд отслеживается",
      stale: "Взгляд не найден",
      unavailable: "Нет данных от трекера — проверьте Tobii",
      "legacy-conflict": "Закройте отдельный Bubble"
    };
    activeTray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: state.preferences.enabled ? "Скрыть точку" : "Показать точку",
          enabled: !stopping,
          click: () => {
            const current = controller.snapshot();
            void controller
              .change({ ...current, patch: { enabled: !current.preferences.enabled } })
              .then((result) => {
                if (!result.ok)
                  activeTray.displayBalloon({
                    title: "LINKa Bubble",
                    content: "Не удалось сохранить настройки."
                  });
              });
          }
        },
        { label: "Настройки Bubble", click: openBubbleSettings },
        { label: labels[state.tracker], enabled: false },
        { type: "separator" },
        { label: "Завершить Bubble", click: () => app.quit() }
      ])
    );
  });
  const closeControl = await serveBubbleControl(
    directory,
    bubbleInstallationId(),
    controller,
    async () => {
      await writeFile(
        join(directory, "resume-after-update.json"),
        JSON.stringify({
          installationId: bubbleInstallationId(),
          createdAt: Date.now(),
          version: app.getVersion()
        }),
        { mode: 0o600 }
      );
      app.quit();
    }
  );
  resources.closeControl = closeControl;
  if (stopping) {
    await closeControl();
    return;
  }

  resources.timer = setInterval(() => {
    const source = tracker;
    if (polling || !source || !backendReady || !preferences.enabled || stopping || retry) return;
    polling = true;
    const currentGeneration = generation;
    void source
      .request("getLatest")
      .then((reply) => {
        if (
          source !== tracker ||
          stopping ||
          currentGeneration !== generation ||
          !preferences.enabled
        )
          return;
        if (reply.sample && reply.bounds) {
          presentation.record(
            reply.sample,
            reply.bounds,
            screen.getPrimaryDisplay().bounds,
            preferences.smoothness,
            performance.now()
          );
        } else presentation.reset();
        const frame = presentation.frame(preferences, performance.now());
        if (frame && !overlay.isDestroyed()) {
          if (!overlay.isVisible()) overlay.showInactive();
          retryCount = 0;
        } else if (!overlay.isDestroyed()) overlay.hide();
        controller.runtime(reply.status, !!frame, reply.errorCode);
      })
      .catch(() => failed(source, "BACKEND_UNAVAILABLE"))
      .finally(() => {
        polling = false;
      });
  }, 1000 / 60);

  app.on("window-all-closed", () => {
    /* The tray owns this independent session. */
  });
  await unlink(join(directory, "resume-after-update.json")).catch(() => undefined);
}
