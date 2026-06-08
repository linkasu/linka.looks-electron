import { createApp } from "vue";
import { PageWatcher } from "@linkasu/tobii-electron/renderer";
import App from "./App.vue";
import router from "./router";
import store from "./store";
import vuetify from "./plugins/vuetify";
import platformPlugin from "./plugins/platform";
import { loadFonts } from "./plugins/webfontloader";
import "./store/eStore";
const pageWatcher = new PageWatcher({
  getSettings: () => ({
    timeout: store.state.button.timeout,
    enabled: store.state.button.enabled,
    eyeActivation: store.state.button.eyeActivation,
    eyeSelect: store.state.button.eyeSelect,
    keyboardActivation: store.state.button.keyboardActivation,
    joystickActivation: store.state.button.joystickActivation
  }),
  getKeyMapping: () => store.state.keyMapping
});
void pageWatcher;

loadFonts();

createApp(App)
  .use(router)
  .use(store)
  .use(platformPlugin)
  .use(vuetify)
  .mount("#app");
