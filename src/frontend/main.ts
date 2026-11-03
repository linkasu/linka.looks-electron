import { createApp, nextTick, watch } from "vue";
import { PageWatcher } from "@linkasu/tobii-electron/renderer";
import App from "./App.vue";
import router from "./router";
import store from "./store";
import vuetify from "./plugins/vuetify";
import platformPlugin from "./plugins/platform";
import "./store/eStore";
import { watchGazeGeometry } from "./utils/watchGazeGeometry";
import { ipcRenderer } from "electron";
import { TTS } from "./utils/TTS";
const watcherOptions = {
  getSettings: () => ({
    timeout: store.state.button.timeout,
    enabled: store.state.button.enabled,
    eyeActivation: store.state.button.eyeActivation,
    eyeSelect: store.state.button.eyeSelect,
    keyboardActivation: store.state.button.keyboardActivation,
    joystickActivation: store.state.button.joystickActivation
  }),
  getKeyMapping: () => store.state.keyMapping
};
let pageWatcher = new PageWatcher(watcherOptions);
let typingActive = false;
let stopGeometry = watchGazeGeometry(pageWatcher);
ipcRenderer.on("typing:active", (_event, active: boolean) => {
  if (active === typingActive) return;
  typingActive = active;
  if (active) {
    stopGeometry();
    pageWatcher.destroy();
  } else {
    pageWatcher = new PageWatcher(watcherOptions);
    stopGeometry = watchGazeGeometry(pageWatcher);
  }
});
ipcRenderer.on("typing:speech", async (_event, id: number, text: string | null) => {
  if (text === null) {
    TTS.instance.stop();
    return;
  }
  let ok = false;
  try {
    await TTS.instance.playText(text);
    ok = true;
  } catch {
    /* Main receives only a boolean. */
  }
  await ipcRenderer.invoke("typing:speech-result", id, ok);
});
void pageWatcher;

watch(
  () => [store.state.button.enabled, store.state.ui.gazeSuspended],
  async () => {
    await nextTick();
    if (!typingActive) pageWatcher.watchElementsChange(true);
  }
);

const app = createApp(App).use(router).use(store).use(platformPlugin).use(vuetify);
app.onUnmount(() => stopGeometry());
app.mount("#app");
