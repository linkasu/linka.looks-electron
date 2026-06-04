import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import store from "./store";
import vuetify from "./plugins/vuetify";
import platformPlugin from "./plugins/platform";
import { loadFonts } from "./plugins/webfontloader";
import { PageWatcher } from "../electron/tobii/pageWatch";
import "./store/eStore";
const pageWatcher = new PageWatcher();
void pageWatcher;

loadFonts();

createApp(App)
  .use(router)
  .use(store)
  .use(platformPlugin)
  .use(vuetify)
  .mount("#app");
