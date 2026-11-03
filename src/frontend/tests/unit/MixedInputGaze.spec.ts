import { mount } from "@vue/test-utils";
import { createStore } from "vuex";
import { PageWatcher } from "@linkasu/tobii-electron/renderer";
import EyeButton from "@/frontend/components/EyeButton.vue";

describe("independent inputs through the real PageWatcher", () => {
  beforeEach(() => {
    // Synthetic events must occur after Vue's listener-attachment timestamp.
    let timestamp = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => ++timestamp);
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, "getGamepads");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    { input: "keyboard", keyboardActivation: true, joystickActivation: false },
    // Upstream clickWatch loses the joystick source; keep this regression red until fixed upstream.
    { input: "joystick", keyboardActivation: false, joystickActivation: true },
    { input: "keyboard", keyboardActivation: true, joystickActivation: true },
    { input: "joystick", keyboardActivation: true, joystickActivation: true }
  ])(
    "selects and activates with $input (keyboard=$keyboardActivation, joystick=$joystickActivation)",
    async ({ input, keyboardActivation, joystickActivation }) => {
      const { wrapper, watcher, press, activated } = setup({
        keyboardActivation,
        joystickActivation
      });
      try {
        press(input);
        await wrapper.vm.$nextTick();
        const selected = wrapper.classes().includes("isInside");
        press(input);
        await wrapper.vm.$nextTick();
        expect({ selected, activations: activated.mock.calls.length }).toEqual({
          selected: true,
          activations: 1
        });
      } finally {
        watcher.destroy();
        wrapper.unmount();
      }
    }
  );

  it("does not activate by mouse when mouseActivation is false", async () => {
    const { wrapper, watcher, activated } = setup({ mouseActivation: false });
    try {
      wrapper.element.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
      await wrapper.vm.$nextTick();
      expect(activated).not.toHaveBeenCalled();
    } finally {
      watcher.destroy();
      wrapper.unmount();
    }
  });

  it.each([
    { input: "keyboard", keyboardActivation: false, joystickActivation: true },
    { input: "joystick", keyboardActivation: true, joystickActivation: false }
  ])(
    "ignores disabled $input without disabling the other inputs",
    async ({ input, keyboardActivation, joystickActivation }) => {
      const { wrapper, watcher, press, activated } = setup({
        keyboardActivation,
        joystickActivation
      });
      try {
        press(input);
        press(input);
        await wrapper.vm.$nextTick();
        expect(wrapper.classes()).not.toContain("isInside");
        expect(activated).not.toHaveBeenCalled();
        wrapper.element.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
        expect(activated).toHaveBeenCalledTimes(1);
      } finally {
        watcher.destroy();
        wrapper.unmount();
      }
    }
  );

  it("keeps gaze and keyboard activation available with the mouse disabled", async () => {
    const { wrapper, watcher, press, activated } = setup({
      mouseActivation: false,
      keyboardActivation: true
    });
    try {
      await wrapper.vm.$nextTick();
      press("keyboard");
      await wrapper.vm.$nextTick();
      press("keyboard");
      await wrapper.vm.$nextTick();
      expect(activated).toHaveBeenCalledTimes(1);
      watcher.enterWatch(wrapper.element);
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".progress-bar").exists()).toBe(true);
      watcher.clickWatch(wrapper.element, true);
      await wrapper.vm.$nextTick();
      expect(activated).toHaveBeenCalledTimes(2);
      expect(wrapper.find(".progress-bar").exists()).toBe(false);
    } finally {
      watcher.destroy();
      wrapper.unmount();
    }
  });
});

function setup(options: {
  keyboardActivation?: boolean;
  joystickActivation?: boolean;
  mouseActivation?: boolean;
}) {
  let frame: FrameRequestCallback | undefined;
  let pressed = false;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  Object.defineProperty(navigator, "getGamepads", {
    configurable: true,
    value: () => [{ id: "qualification", buttons: [{ value: Number(pressed) }] }]
  });
  const store = createStore({
    state: {
      button: {
        enabled: true,
        eyeActivation: true,
        eyeSelect: true,
        keyboardActivation: false,
        joystickActivation: false,
        mouseActivation: true,
        clickSound: false,
        timeout: 1000,
        borders: 1,
        ...options
      }
    }
  });
  const activated = vi.fn();
  const wrapper = mount(EyeButton, {
    attachTo: document.body,
    attrs: { onClick: activated },
    global: { plugins: [store] }
  });
  vi.spyOn(wrapper.element, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 100));
  const watcher = new PageWatcher({
    getSettings: () => store.state.button,
    getKeyMapping: () => ({ enter: ["Enter", "joy0"] }),
    ipcRenderer: { on: vi.fn(), off: vi.fn(), send: vi.fn() }
  });
  function press(input: string) {
    if (input === "keyboard") {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter" }));
    } else {
      pressed = true;
      frame?.(0);
      pressed = false;
      frame?.(0);
    }
  }
  return { wrapper, watcher, press, activated };
}
