import { createApp, nextTick, watch, h } from "vue";
import { createStore } from "vuex";
import { createRouter, createMemoryHistory } from "vue-router";
import { createVuetify } from "vuetify";
import { VApp, VIcon } from "vuetify/components";
import "vuetify/styles";
import { PageWatcher } from "@linkasu/tobii-electron/renderer";
import EyeTypingView from "../views/EyeTypingView.vue";
import { watchGazeGeometry } from "../utils/watchGazeGeometry";
import { DEFAULT_COLORS } from "../plugins/visualDefaults";

const settings = window.typingBridge.settings();
const store = createStore({
  state: { ...settings, ui: { gazeSuspended: false } },
  actions: {
    button_enabled({ state }) {
      state.button.enabled = !state.button.enabled;
    }
  }
});
const router = createRouter({ history: createMemoryHistory(), routes: [] });
const app = createApp({
  render: () =>
    h(VApp, {}, () => [
      h("audio", { id: "button_audio", src: "./assets/sounds/button.wav" }),
      h(EyeTypingView, { exit: () => window.typingBridge.close() })
    ])
});
app
  .use(store)
  .use(router)
  .use(
    createVuetify({
      components: { VApp, VIcon },
      theme: { themes: { light: { colors: DEFAULT_COLORS } } }
    })
  );
app.mount("#app");
const watcher = new PageWatcher({
  getSettings: () => store.state.button,
  getKeyMapping: () => store.state.keyMapping
});
watch(
  () => store.state.button.enabled,
  async () => {
    await nextTick();
    watcher.watchElementsChange(true);
  }
);
app.onUnmount(watchGazeGeometry(watcher));
window.addEventListener("beforeunload", () => watcher.destroy(), { once: true });
