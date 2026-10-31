import { mount } from "@vue/test-utils";
import { createStore } from "vuex";
import { PageWatcher } from "@linkasu/tobii-electron/renderer";
import OutputLine from "@/frontend/components/OutputLine.vue";
import { CardType } from "@/common/interfaces/ConfigFile";
import { TTS } from "@/frontend/utils/TTS";

vi.mock("@/frontend/utils/TTS", () => ({
  TTS: { instance: { playCards: vi.fn().mockResolvedValue(undefined) } }
}));

describe("OutputLine lock with the real EyeButton and PageWatcher", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, "getGamepads");
  });

  it("keeps gaze-only output usable after attempting to activate lock", async () => {
    const { wrapper, watcher, store, ipc, send, cards } = mountOutputLine(false);
    try {
      const lock = wrapper.get("button.lock");
      const output = wrapper.get("button.output-block");
      const targets = wrapper.findAll("button.eye");
      // Replay the tracker protocol using the current target ID and index.
      function gaze(button: Element) {
        const update = send.mock.calls.at(-1)?.[1];
        const data = {
          id: update?.id,
          elementIndex: targets.findIndex((target) => target.element === button),
          count: 1
        };
        for (const channel of ["eye-enter", "eye-click"]) {
          const listener = ipc.on.mock.calls.find(([name]) => name === channel)?.[1];
          expect(listener).toBeDefined();
          listener?.({}, data);
        }
      }

      gaze(lock.element);
      await wrapper.vm.$nextTick();
      watcher.watchElementsChange(true);

      expect(store.state.button.enabled).toBe(true);
      expect(lock.classes()).not.toContain("isInside");
      expect(lock.find(".progress-bar").exists()).toBe(false);
      expect(wrapper.findAll("button.eye")).toHaveLength(targets.length);
      expect(send.mock.calls.at(-1)?.[1].elements).toHaveLength(targets.length);

      gaze(output.element);
      await wrapper.vm.$nextTick();

      expect(output.classes()).toContain("isInside");
      expect(TTS.instance.playCards).toHaveBeenCalledExactlyOnceWith("set.linka", cards);
      expect(store.state.button.enabled).toBe(true);
    } finally {
      watcher.destroy();
      wrapper.unmount();
    }
  });

  it("still locks and unlocks with the mouse", async () => {
    const { wrapper, watcher, store } = mountOutputLine(false);
    try {
      const lock = wrapper.get("button.lock").element as HTMLButtonElement;
      const output = wrapper.get("button.output-block").element as HTMLButtonElement;
      for (const enabled of [false, true]) {
        lock.click();
        await wrapper.vm.$nextTick();
        watcher.watchElementsChange(true);
        expect(store.state.button.enabled).toBe(enabled);
        expect(lock.disabled).toBe(false);
        expect(output.disabled).toBe(!enabled);
      }
    } finally {
      watcher.destroy();
      wrapper.unmount();
    }
  });

  it("still selects, locks and unlocks with the keyboard", async () => {
    const { wrapper, watcher, store } = mountOutputLine(true);
    try {
      const lock = wrapper.get("button.lock");
      // jsdom has no layout; the watcher ignores zero-width keyboard targets.
      vi.spyOn(lock.element, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 100));
      const enter = () => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter" }));
      enter();
      await wrapper.vm.$nextTick();
      expect(lock.classes()).toContain("isInside");
      expect(store.state.button.enabled).toBe(true);

      for (const enabled of [false, true]) {
        enter();
        await wrapper.vm.$nextTick();
        watcher.watchElementsChange(true);
        expect(store.state.button.enabled).toBe(enabled);
      }
    } finally {
      watcher.destroy();
      wrapper.unmount();
    }
  });
});

function mountOutputLine(keyboardActivation: boolean) {
  const store = createStore({
    state: {
      ui: { exitButton: false },
      button: {
        enabled: true,
        eyeActivation: true,
        eyeSelect: true,
        keyboardActivation,
        joystickActivation: keyboardActivation,
        clickSound: false,
        timeout: 1000,
        borders: 1
      }
    },
    mutations: {
      button_enabled(state, enabled: boolean) {
        state.button.enabled = enabled;
      }
    },
    actions: {
      button_enabled({ state, commit }) {
        commit("button_enabled", !state.button.enabled);
      }
    }
  });
  const cards = [{ id: "hello", cardType: CardType.AudioCard, title: "Привет" }];
  const wrapper = mount(OutputLine, {
    attachTo: document.body,
    props: { file: "set.linka", cards },
    global: {
      plugins: [store],
      stubs: {
        VLayout: { template: "<div><slot /></div>" },
        VIcon: true,
        SetGridButton: true
      }
    }
  });
  const ipc = {
    on: vi.fn<(channel: string, listener: (event: unknown, data: unknown) => void) => void>(),
    off: vi.fn()
  };
  const send = vi.fn<(channel: string, data: { id: string; elements: unknown[] }) => void>();
  const watcher = new PageWatcher({
    getSettings: () => store.state.button,
    getKeyMapping: () => ({ enter: ["Enter"] }),
    ipcRenderer: { ...ipc, send }
  });
  return { wrapper, watcher, store, ipc, send, cards };
}
