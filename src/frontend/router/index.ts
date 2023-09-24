import { createRouter, createWebHashHistory, RouteRecordRaw } from "vue-router";
import HomeView from "@frontend/views/HomeView.vue";
import HomeViewAppBar from "@frontend/views/HomeView.appbar.vue";
import SetExplorerView from "@frontend/views/SetExplorerView.vue";
import SetExplorerViewAppBar from "@frontend/views/SetExplorerView.appbar.vue";
import EditorView from "@frontend/views/EditorView.vue";
import EditorViewAppBar from "@frontend/views/EditorView.appbar.vue";
import SettingsView from "@frontend/views/SettingsView.vue";
import SettingsViewAppBar from "@frontend/views/SettingsView.appbar.vue";
// @ts-ignore  
import { storageService } from "@frontend/services/index.ts";

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
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});
storageService.getArgv()
  .then((argv: string) => {
    if (!argv[1] || !argv[1].endsWith("linka")) return;
    router.push("/set/" + argv[1]);
  });

export default router;
