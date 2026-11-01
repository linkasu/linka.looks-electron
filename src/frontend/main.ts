import { createApp, nextTick, watch } from "vue";
import { PageWatcher } from "@linkasu/tobii-electron/renderer";
import App from "./App.vue";
import router from "./router";
import store from "./store";
import vuetify from "./plugins/vuetify";
import platformPlugin from "./plugins/platform";
import "./store/eStore";
import { watchGazeGeometry } from "./utils/watchGazeGeometry";
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

watch(
  () => [store.state.button.enabled, store.state.ui.gazeSuspended],
  async () => {
    await nextTick();
    pageWatcher.watchElementsChange(true);
  }
);

const app = createApp(App).use(router).use(store).use(platformPlugin).use(vuetify);
app.onUnmount(watchGazeGeometry(pageWatcher));
app.mount("#app");
