import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createStore } from "vuex";
import { PageWatcher } from "@linkasu/tobii-electron/renderer";
import { createRouter, createMemoryHistory } from "vue-router";
import EyeTypingView from "@/frontend/views/EyeTypingView.vue";
import { eStore } from "@/frontend/store/eStore";
import { loadTypingDraft, saveTypingDraft } from "@/frontend/services/typingDraft";
import type { TypingPredictor } from "@/frontend/services/typingPredictor";
import type { TypingEdit } from "@/common/typing";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { Predictor } from "../../../../vendor/predictor/packages/electron/src/index";
import { TypingSession } from "../../../electron/services/typingSession";

const executablePath = resolve(
  "predictor-resources",
  process.platform === "win32" ? "lp-electron.exe" : "lp-electron"
);

const suggestion = (word: string): TypingEdit => ({
  word,
  draft: { text: word + " ", caret: Array.from(word).length + 1 }
});

const tts = vi.hoisted(() => ({ playText: vi.fn(async () => {}), stop: vi.fn() }));
vi.mock("@/frontend/utils/TTS", () => ({ TTS: { instance: tts } }));

const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  window.history.replaceState(null, "", "/");
});

async function setup(predictor?: TypingPredictor, typingLayout: unknown = "A") {
  const store = createStore({
    state: {
      typingLayout,
      button: {
        enabled: true,
        borders: 1,
        timeout: 1500,
        dwellIndicator: "circle",
        clickSound: false,
        eyeSelect: true,
        eyeActivation: true,
        keyboardActivation: true,
        joystickActivation: true
      },
      ui: { gazeSuspended: false }
    },
    actions: {
      button_enabled({ state }) {
        state.button.enabled = !state.button.enabled;
      }
    }
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/eye-typing", component: EyeTypingView },
      { path: "/§", component: { template: "<div>Наборы</div>" } }
    ]
  });
  await router.push("/eye-typing");
  const wrapper = mount(EyeTypingView, {
    attachTo: document.body,
    props: { predictor },
    global: { plugins: [store, router], stubs: { "v-icon": true } }
  });
  wrappers.push(wrapper);
  await flushPromises();
  return { wrapper, store, router };
}

async function click(wrapper: VueWrapper, label: string) {
  const button = wrapper
    .findAll("button")
    .find((button) => (button.attributes("aria-label") || button.text()) === label);
  expect(button, label).toBeDefined();
  await button!.trigger("click");
  await flushPromises();
}

describe("eye typing UI", () => {
  it.skipIf(!existsSync(executablePath) || !existsSync(resolve("predictor-resources/model.lpk")))(
    "selects and undoes via real renderer service, session and tiny sidecar (in-memory IPC bridge)",
    async () => {
      const session = new TypingSession(
        new Predictor({
          executablePath,
          modelPath: resolve("predictor-resources/model.lpk")
        })
      );
      const previous = Object.getOwnPropertyDescriptor(window, "typingBridge");
      // Only IPC transport is substituted; no live Electron, tracker, store or TTS.
      Object.defineProperty(window, "typingBridge", {
        configurable: true,
        value: {
          predict: (id: number, input: Parameters<TypingSession["predict"]>[1]) =>
            session.predict(id, input),
          cancel: (id: number) => session.cancel(id)
        }
      });
      const draft = { text: "😀 я хо хвост!", caret: Array.from("😀 я хо").length };
      saveTypingDraft(draft);
      let wrapper: VueWrapper | undefined;
      try {
        ({ wrapper } = await setup());
        const view = wrapper;
        await vi.waitFor(() => expect(view.find('[aria-label="хочу"]').exists()).toBe(true));
        await click(view, "Курсор");
        await click(view, "хочу");
        expect(loadTypingDraft()).toEqual({
          text: "😀 я хочу хвост!",
          caret: Array.from("😀 я хочу ").length
        });
        await click(view, "Отменить");
        expect(loadTypingDraft()).toEqual(draft);
        await vi.waitFor(() => expect(view.find('[aria-label="хочу"]').exists()).toBe(true));
        const oldButton = view.get('[aria-label="хочу"]');
        await click(view, "В начало");
        await oldButton.trigger("click");
        expect(loadTypingDraft()).toEqual({ ...draft, caret: 0 });
        expect(view.get('[aria-label="Подсказки слов"]').text()).not.toContain("хочу");
      } finally {
        wrapper?.unmount();
        await session.dispose();
        if (previous) Object.defineProperty(window, "typingBridge", previous);
        else Reflect.deleteProperty(window, "typingBridge");
      }
    }
  );

  it.each(["cursor", "text", "language", "cursor ABA", "text ABA"])(
    "cannot select a delayed suggestion after %s changes",
    async (change) => {
      const draft = { text: "я хо!", caret: 4 };
      saveTypingDraft(draft);
      const pending: { resolve: (edits: TypingEdit[]) => void; signal: AbortSignal }[] = [];
      const suggest: TypingPredictor["suggest"] = (_, signal) =>
        new Promise((resolve) => pending.push({ resolve, signal }));
      const { wrapper } = await setup({ suggest });
      if (change.startsWith("cursor")) {
        await click(wrapper, "Курсор");
        await click(wrapper, "Символ влево");
        if (change.endsWith("ABA")) await click(wrapper, "Символ вправо");
      } else if (change.startsWith("text")) {
        await click(wrapper, "а");
        if (change.endsWith("ABA")) await click(wrapper, "Отменить");
      } else await click(wrapper, "RU → EN");
      expect(pending[0].signal.aborted).toBe(true);
      const current = loadTypingDraft();
      const edit = { word: "хочу", draft: { text: "я хочу!", caret: 6 } };
      pending[0].resolve([edit]);
      await flushPromises();
      expect(wrapper.find('[aria-label="хочу"]').exists()).toBe(false);
      expect(loadTypingDraft()).toEqual(current);
      if (change.endsWith("ABA")) {
        expect(current).toEqual(draft);
        pending.at(-1)!.resolve([edit]);
        await flushPromises();
        await click(wrapper, "хочу");
        expect(loadTypingDraft()).toEqual(edit.draft);
        await click(wrapper, "Отменить");
        expect(loadTypingDraft()).toEqual(draft);
      }
    }
  );

  it("keeps space and editing available on the cursor screen with the same draft semantics", async () => {
    saveTypingDraft({ text: "hello world", caret: 5 });
    const { wrapper } = await setup();
    await click(wrapper, "Курсор");
    await click(wrapper, "Убрать символ");
    expect(loadTypingDraft()).toEqual({ text: "hell world", caret: 4 });
    await click(wrapper, "Отменить");
    await click(wrapper, "Убрать слово");
    expect(loadTypingDraft()).toEqual({ text: " world", caret: 0 });
    await click(wrapper, "Отменить");
    await click(wrapper, "Пробел");
    expect(loadTypingDraft()).toEqual({ text: "hello  world", caret: 6 });
    await click(wrapper, "Отменить");
    expect(loadTypingDraft()).toEqual({ text: "hello world", caret: 5 });
    expect(wrapper.find(".navigation").exists()).toBe(true);
  });
  it.each(["A", "B", "C"])("opens saved layout %s without a dev URL", async (layout) => {
    saveTypingDraft({ text: "привет", caret: 3 });
    const { wrapper } = await setup(undefined, layout);
    expect(wrapper.classes()).toContain("variant-C");
    expect(wrapper.find(".prototype-switcher").exists()).toBe(false);
    expect(loadTypingDraft()).toEqual({ text: "привет", caret: 3 });
  });
  it("falls back to C for an unknown saved layout", async () => {
    const { wrapper } = await setup(undefined, "D");
    expect(wrapper.classes()).toContain("variant-C");
  });
  it("stops speech without reporting cancellation as failure or changing the draft", async () => {
    saveTypingDraft({ text: "hello", caret: 3 });
    let rejectSpeech: (reason: Error) => void = () => {};
    tts.playText.mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          rejectSpeech = reject;
        })
    );
    const { wrapper } = await setup();
    await click(wrapper, "Озвучить всё");
    await click(wrapper, "Стоп");
    expect(tts.stop).toHaveBeenCalled();
    rejectSpeech(new Error("Speech unavailable"));
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(loadTypingDraft()).toEqual({ text: "hello", caret: 3 });
    expect(wrapper.find('[aria-label="Озвучить всё"]').exists()).toBe(true);
  });

  it("ignores legacy variant URLs without editing the draft or adding a switcher", async () => {
    window.history.replaceState(null, "", "/?variant=B");
    saveTypingDraft({ text: "привет", caret: 3 });
    const { wrapper } = await setup();
    expect(wrapper.classes()).toContain("variant-C");
    expect(wrapper.find(".prototype-switcher").exists()).toBe(false);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    await wrapper.vm.$nextTick();
    expect(wrapper.classes()).toContain("variant-C");
    expect(loadTypingDraft()).toEqual({ text: "привет", caret: 3 });
  });
  it("sends full text with a UTF16 caret and cancels on an ABA edit, EN and unmount", async () => {
    saveTypingDraft({ text: "😀хо хвост", caret: 3 });
    const suggest = vi.fn<TypingPredictor["suggest"]>(() => new Promise(() => {}));
    const { wrapper } = await setup({ suggest });
    expect(suggest.mock.calls[0][0]).toEqual({ text: "😀хо хвост", caret: 4, language: "ru" });
    const initial = suggest.mock.calls[0][1];
    await click(wrapper, "а");
    expect(initial.aborted).toBe(true);
    await click(wrapper, "Отменить");
    const restored = suggest.mock.calls.at(-1)![1];
    expect(restored).not.toBe(initial);
    await click(wrapper, "RU → EN");
    expect(restored.aborted).toBe(true);
    await click(wrapper, "EN → RU");
    const last = suggest.mock.calls.at(-1)![1];
    wrapper.unmount();
    expect(last.aborted).toBe(true);
  });
  it.each(["A", "B", "C"])("layout %s: synthetic tracker protocol and pause", async (layout) => {
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
    const { wrapper, store } = await setup(undefined, layout);
    const ipc = {
      on: vi.fn<(channel: string, listener: (event: unknown, data: unknown) => void) => void>(),
      off: vi.fn()
    };
    const send = vi.fn<(channel: string, data: { id: string }) => void>();
    const watcher = new PageWatcher({
      getSettings: () => store.state.button,
      getKeyMapping: () => ({ enter: ["Enter"] }),
      ipcRenderer: { ...ipc, send }
    });
    async function gaze(label: string) {
      watcher.watchElementsChange(true);
      const targets = wrapper.findAll("button.eye");
      const data = {
        id: send.mock.calls.at(-1)?.[1].id,
        elementIndex: targets.findIndex(
          (button) => (button.attributes("aria-label") || button.text()) === label
        ),
        count: 1
      };
      expect(data.elementIndex).toBeGreaterThanOrEqual(0);
      for (const channel of ["eye-enter", "eye-click"]) {
        const listener = ipc.on.mock.calls.find(([name]) => name === channel)?.[1];
        expect(listener).toBeDefined();
        listener!({}, data);
      }
      await flushPromises();
    }
    try {
      await gaze("а");
      await gaze("а");
      await gaze("Цифры");
      await gaze("1");
      await gaze("Курсор");
      await gaze("В начало");
      await gaze("Буквы");
      await gaze("б");
      expect(loadTypingDraft()).toEqual({ text: "баа1", caret: 1 });
      await gaze("Приостановить управление");
      expect(store.state.button.enabled).toBe(false);
      await gaze("Возобновить управление");
      expect(store.state.button.enabled).toBe(true);
    } finally {
      watcher.destroy();
      Reflect.deleteProperty(navigator, "getGamepads");
    }
  });

  it("types numbers and signs repeatedly, returns to letters and navigates without losing text", async () => {
    const { wrapper } = await setup();
    await click(wrapper, "а");
    await click(wrapper, "Цифры");
    await click(wrapper, "1");
    await click(wrapper, "2");
    expect(wrapper.find('[aria-label="1"]').exists()).toBe(true);
    await click(wrapper, "Знаки");
    await click(wrapper, "!");
    await click(wrapper, "?");
    expect(loadTypingDraft()).toEqual({ text: "а12!?", caret: 5 });
    await click(wrapper, "Курсор");
    expect(wrapper.find('[aria-label="Клавиши"]').exists()).toBe(false);
    await click(wrapper, "В начало");
    await click(wrapper, "Символ вправо");
    await click(wrapper, "Буквы");
    await click(wrapper, "б");
    expect(loadTypingDraft()).toEqual({ text: "аб12!?", caret: 2 });
  });

  it("replaces a suggested word plus space in one undo, clears and restores immediately", async () => {
    saveTypingDraft({ text: "при", caret: 3 });
    const { wrapper } = await setup({
      suggest: vi.fn(async () => [
        suggestion("привет"),
        suggestion("привет"),
        suggestion("<invalid>")
      ])
    });
    await click(wrapper, "привет");
    expect(loadTypingDraft()).toEqual({ text: "привет ", caret: 7 });
    await click(wrapper, "Отменить");
    expect(loadTypingDraft()).toEqual({ text: "при", caret: 3 });
    await click(wrapper, "Очистить всё");
    expect(loadTypingDraft()).toEqual({ text: "", caret: 0 });
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    await click(wrapper, "Отменить");
    expect(loadTypingDraft()).toEqual({ text: "при", caret: 3 });
  });

  it("supports manual EN without querying the RU predictor", async () => {
    const suggest = vi.fn(async () => [suggestion("привет")]);
    const { wrapper } = await setup({ suggest });
    await click(wrapper, "RU → EN");
    await click(wrapper, "h");
    await click(wrapper, "i");
    expect(loadTypingDraft()).toEqual({ text: "hi", caret: 2 });
    expect(suggest).not.toHaveBeenCalled();
    expect(wrapper.get('[aria-label="Подсказки слов"]').findAll("button")).toHaveLength(3);
    expect(wrapper.get('[aria-label="Подсказки слов"]').text()).toContain("Нет подсказок");
    expect(wrapper.get('[aria-label="Подсказки слов"]').text()).not.toContain("EN");
  });

  it("shows all letters at once and keeps their positions when predictions arrive", async () => {
    saveTypingDraft({ text: "п", caret: 1 });
    const { wrapper } = await setup({ suggest: vi.fn(async () => [suggestion("привет")]) });
    const keys = () =>
      wrapper
        .get('[aria-label="Клавиши"]')
        .findAll("button")
        .map((key) => key.text());
    expect(keys().join("")).toBe("ёйцукенгшщзхъфывапролджэячсмитьбю");
    expect(wrapper.get('[aria-label="Подсказки слов"]').findAll("button")).toHaveLength(3);
    await click(wrapper, "я");
    expect(keys()).toHaveLength(33);
    await click(wrapper, "RU → EN");
    expect(keys().join("")).toBe("qwertyuiopasdfghjklzxcvbnm");
    expect(wrapper.text()).not.toContain("Ещё");
  });

  it("keeps the selected screen on language changes without paging", async () => {
    const { wrapper } = await setup();
    await click(wrapper, "л");
    await click(wrapper, "я");
    await click(wrapper, "Цифры");
    await click(wrapper, "RU → EN");
    await click(wrapper, "1");
    await click(wrapper, "Буквы");
    await click(wrapper, "a");
    expect(loadTypingDraft().text).toBe("ля1a");
  });

  it("reads the whole text without changing draft and reloads caret on return", async () => {
    saveTypingDraft({ text: "привет hello", caret: 3 });
    const { wrapper, router } = await setup();
    await click(wrapper, "Озвучить всё");
    expect(tts.playText).toHaveBeenCalledWith("привет hello");
    expect(loadTypingDraft()).toEqual({ text: "привет hello", caret: 3 });
    await click(wrapper, "К наборам");
    expect(router.currentRoute.value.path).toBe("/§");
    wrapper.unmount();
    const fresh = await setup();
    expect(fresh.wrapper.get('[aria-label="Черновик"]').text()).toBe("привет hello");
    expect(fresh.wrapper.get(".draft > span").text()).toBe("при");
    expect(fresh.wrapper.get(".caret").text()).toBe("");
    await click(fresh.wrapper, "а");
    expect(loadTypingDraft()).toEqual({ text: "приавет hello", caret: 4 });
  });

  it.each(["A", "B", "C"])("layout %s: shared dwell settings and pause/resume", async (layout) => {
    const { wrapper, store } = await setup(undefined, layout);
    const key = wrapper.get('[aria-label="а"]');
    key.element.dispatchEvent(new CustomEvent("eye-enter", { detail: { eye: true } }));
    await wrapper.vm.$nextTick();
    expect(key.find(".dwell-circle").exists()).toBe(true);
    expect(key.get(".progress-bar").attributes("style")).toContain("1.5s");
    await wrapper.get('[aria-label="Приостановить управление"]').trigger("click");
    expect(store.state.button.enabled).toBe(false);
    expect((key.element as HTMLButtonElement).disabled).toBe(true);
    expect(key.classes()).not.toContain("eye");
    const resume = wrapper.get('[aria-label="Возобновить управление"]');
    expect(resume.classes()).toContain("eye");
    await resume.trigger("click");
    expect(store.state.button.enabled).toBe(true);
  });

  it("discards stale predictor results and keeps manual input after errors", async () => {
    let resolveOld: (words: TypingEdit[]) => void = () => {};
    const suggest = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<TypingEdit[]>((resolve) => {
            resolveOld = resolve;
          })
      )
      .mockResolvedValueOnce([suggestion("абрикос")]);
    const { wrapper } = await setup({ suggest });
    await click(wrapper, "а");
    await click(wrapper, "б");
    resolveOld([suggestion("арка")]);
    await flushPromises();
    expect(wrapper.get('[aria-label="Подсказки слов"]').text()).toContain("абрикос");
    suggest.mockRejectedValueOnce(new Error("offline"));
    await click(wrapper, "в");
    expect(loadTypingDraft().text).toBe("абв");
  });

  it("reports a failed save and preserves the in-memory draft", async () => {
    const { wrapper } = await setup();
    vi.mocked(eStore.set).mockImplementationOnce(() => {
      throw new Error("disk full");
    });
    await click(wrapper, "а");
    expect(wrapper.get('[role="alert"]').text()).toContain("не сохранён");
    expect(wrapper.get('[aria-label="Черновик"]').text()).toBe("а");
  });

  it("does not allow overwriting a draft when its initial read failed", async () => {
    vi.mocked(eStore.get).mockImplementationOnce(() => {
      throw new Error("unreadable");
    });
    const { wrapper } = await setup();
    expect(wrapper.get('[role="alert"]').text()).toContain("загрузить");
    expect(wrapper.find('[aria-label="Клавиши"]').exists()).toBe(false);
    expect(eStore.set).not.toHaveBeenCalled();
  });
});
