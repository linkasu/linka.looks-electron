import { createRouter, createWebHashHistory, RouteRecordRaw } from "vue-router";
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
  if (!store.state.firstCalibrate && router.currentRoute.value.path !== "/calibration") {
    router.push("/calibration");
  }
}, 500);

export default router;
