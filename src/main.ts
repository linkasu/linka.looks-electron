import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import store from "./store";
import vuetify from "./plugins/vuetify";
import { loadFonts } from "./plugins/webfontloader";
import { PageWatcher } from "./tobii/pageWatch";
import "./store/eStore";

new PageWatcher();

loadFonts();

createApp(App)
  .use(router)
  .use(store)
  .use(vuetify)
  .mount("#app");
