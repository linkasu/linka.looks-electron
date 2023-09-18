import { createRouter, createWebHashHistory, RouteRecordRaw } from "vue-router";
import HomeView from "../с/HomeView.vue";
import HomeViewAppBar from "../views/HomeView.appbar.vue";
import SetExplorerView from "../views/SetExplorerView.vue";
import SetExplorerViewAppBar from "../views/SetExplorerView.appbar.vue";
import EditorView from "../views/EditorView.vue";
import EditorViewAppBar from "../views/EditorView.appbar.vue";
import SettingsView from "../views/SettingsView.vue";
import SettingsViewAppBar from "../views/SettingsView.appbar.vue";
import { storageService } from "../CardsStorage";

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
  .then((argv) => {
    if (!argv[1] || !argv[1].endsWith("linka")) return;
    router.push("/set/" + argv[1]);
  });

export default router;
