import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import store from "./store";
import vuetify from "./plugins/vuetify";
import { loadFonts } from "./plugins/webfontloader";
import { PageWatcher } from "../electron/tobii/pageWatch";
import "./store/eStore";
import "./auth-setup";

const pageWatcher = new PageWatcher();

loadFonts();

const vue = createApp(App)
  .use(router)
  .use(store)
  .use(vuetify)
  .mount("#app");
