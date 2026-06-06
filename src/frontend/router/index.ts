import { createRouter, createWebHashHistory, RouteRecordRaw } from "vue-router";
import { ipcRenderer, type IpcRendererEvent } from "electron";
import HomeView from "@/frontend/views/HomeView.vue";
import HomeViewAppBar from "@/frontend/views/HomeView.appbar.vue";
import SetExplorerView from "@/frontend/views/SetExplorerView.vue";
import SetExplorerViewAppBar from "@/frontend/views/SetExplorerView.appbar.vue";
import EditorView from "@/frontend/views/EditorView.vue";
import EditorViewAppBar from "@/frontend/views/EditorView.appbar.vue";
import SettingsView from "@/frontend/views/SettingsView.vue";
import SettingsViewAppBar from "@/frontend/views/SettingsView.appbar.vue";
import { storageService } from "@/frontend/services/card-storage-service";
import CalibrationView from "../views/CalibrationView.vue";
import TobiiCalibrationView from "../views/TobiiCalibrationView.vue";
import store from "../store";
import { HOME_DIR } from "@/common/constants";
import { platform } from "@/frontend/plugins/platform";
import type { TobiiStatus } from "@/electron/tobii/EyeTrackerProcess";

const routes: Array<RouteRecordRaw> = [
  {
    path: "/",
    redirect: "/§"
  },
  {
    path: "/:path",
    name: "home",
    components: {
      default: HomeView,
      appbar: HomeViewAppBar
    }
  }, {
    path: "/set/:path",
    name: "SetExplorer",
    components: {
      default: SetExplorerView,
      appbar: SetExplorerViewAppBar
    }
  }, {
    path: "/edit/:path",
    name: "Editor",
    components: {
      default: EditorView,
      appbar: EditorViewAppBar
    }
  },
  {
    path: "/settings",
    components: {
      default: SettingsView,
      appbar: SettingsViewAppBar
    }
  },
  {
    path: "/calibration",
    components: {
      default: CalibrationView
    }
  },
  {
    path: "/tobii-calibration",
    components: {
      default: TobiiCalibrationView
    }
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});
storageService.getArgv()
  .then(async (argv: string[]) => {
    const file = argv.find((arg) => arg.toLowerCase().endsWith(".linka"));
    if (!file) return;
    const imported = await storageService.importExternalSet(file);
    router.push("/set/" + toRoutePath(imported));
  })
  .catch((error) => {
    console.error(error);
  });

function toRoutePath (absolutePath: string) {
  return absolutePath.replace(HOME_DIR, "").replaceAll("/", "§").replaceAll("\\", "§");
}

setTimeout(() => {
  void redirectFirstCalibration();
}, 500);

async function redirectFirstCalibration () {
  if (store.state.firstCalibrate) return;
  const currentPath = router.currentRoute.value.path;
  if (currentPath === "/tobii-calibration") return;

  if (await shouldStartWithTobiiCalibration()) {
    router.push("/tobii-calibration?first=1");
    return;
  }

  if (currentPath === "/calibration") return;
  router.push("/calibration");
}

async function shouldStartWithTobiiCalibration () {
  if (!platform.isMacOS) return false;
  try {
    const status = await ipcRenderer.invoke("tobii:status:get") as TobiiStatus;
    if (isTobiiReady(status)) return true;
    if (!isPendingTobiiStatus(status)) return false;
    return await waitForReadyTobiiStatus(5000);
  } catch {
    return false;
  }
}

function waitForReadyTobiiStatus (timeoutMs: number) {
  return new Promise<boolean>((resolve) => {
    const timer = window.setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);
    const onStatus = (event: IpcRendererEvent, status: TobiiStatus) => {
      if (isTobiiReady(status)) {
        cleanup();
        resolve(true);
        return;
      }
      if (!isPendingTobiiStatus(status)) {
        cleanup();
        resolve(false);
      }
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      ipcRenderer.off("tobii:status", onStatus);
    };
    ipcRenderer.on("tobii:status", onStatus);
  });
}

function isTobiiReady (status?: TobiiStatus) {
  return status?.state === "connected" || status?.state === "tracking";
}

function isPendingTobiiStatus (status?: TobiiStatus) {
  return status?.state === "service_starting" || status?.state === "connecting" || status?.state === "reconnecting";
}

export default router;
