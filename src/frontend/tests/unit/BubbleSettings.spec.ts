import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import SystemInteractionSettings from "@/frontend/components/Settings/SystemInteractionSettings.vue";
import { DEFAULT_BUBBLE_PREFERENCES, type BubbleSnapshot } from "@/common/bubble/contract";

const ipc = vi.hoisted(() => ({ invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() }));
vi.mock("electron", () => ({ ipcRenderer: ipc }));
const Checkbox = defineComponent({
  name: "VCheckbox",
  props: ["modelValue", "disabled"],
  template: "<div />"
});
const Slider = defineComponent({
  name: "VSlider",
  props: ["modelValue", "disabled", "label"],
  template: "<div />"
});
const Button = defineComponent({
  name: "VBtn",
  props: ["disabled"],
  template: '<button :disabled="disabled"><slot /></button>'
});
const state = (overrides: Partial<BubbleSnapshot> = {}): BubbleSnapshot => ({
  instanceId: "epoch-a",
  revision: 1,
  stateSequence: 1,
  preferences: { ...DEFAULT_BUBBLE_PREFERENCES },
  tracker: "not-requested",
  displayed: false,
  errorCode: null,
  ...overrides
});
const wrappers: ReturnType<typeof mount>[] = [];
function render(isWindows = true) {
  const wrapper = mount(SystemInteractionSettings, {
    global: {
      provide: { platform: { isWindows } },
      stubs: { VCheckbox: Checkbox, VSlider: Slider, VBtn: Button }
    }
  });
  wrappers.push(wrapper);
  return wrapper;
}
function publish(snapshot: BubbleSnapshot) {
  ipc.on.mock.calls[0][1]({}, snapshot);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  ipc.invoke.mockResolvedValue({ ok: true, state: state() });
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.useRealTimers();
});

describe("bubble settings", () => {
  it("does not contact Windows IPC on unsupported platforms", async () => {
    const wrapper = render(false);
    await flushPromises();
    expect(wrapper.text()).toContain("только в Windows");
    expect(ipc.invoke).not.toHaveBeenCalled();
    expect(ipc.on).not.toHaveBeenCalled();
  });

  it("subscribes before reading and never writes on mount", async () => {
    const wrapper = render();
    await flushPromises();
    expect(ipc.on.mock.invocationCallOrder[0]).toBeLessThan(ipc.invoke.mock.invocationCallOrder[0]);
    expect(ipc.invoke.mock.calls).toEqual([["bubble:getState"]]);
    expect(wrapper.get('[data-testid="bubble-status"]').text()).toContain("выключено");
    wrapper.unmount();
    expect(ipc.removeListener).toHaveBeenCalledWith("bubble:state", ipc.on.mock.calls[0][1]);
  });

  it("cancels debounced changes on a tray update and rejects old snapshots", async () => {
    const wrapper = render();
    await flushPromises();
    wrapper.findAllComponents(Slider)[0].vm.$emit("update:modelValue", 70);
    publish(
      state({
        stateSequence: 3,
        revision: 2,
        preferences: { ...DEFAULT_BUBBLE_PREFERENCES, enabled: true, diameter: 80 }
      })
    );
    publish(state({ stateSequence: 2 }));
    await vi.advanceTimersByTimeAsync(120);
    expect(ipc.invoke).toHaveBeenCalledTimes(1);
    expect(wrapper.findAllComponents(Slider)[0].props("modelValue")).toBe(80);
    expect(wrapper.getComponent(Checkbox).props("modelValue")).toBe(true);
  });

  it("coalesces slider values into a single-field versioned patch", async () => {
    const wrapper = render();
    await flushPromises();
    const slider = wrapper.findAllComponents(Slider)[0];
    slider.vm.$emit("update:modelValue", 60);
    slider.vm.$emit("update:modelValue", 65);
    await vi.advanceTimersByTimeAsync(120);
    expect(ipc.invoke).toHaveBeenLastCalledWith("bubble:change", {
      instanceId: "epoch-a",
      revision: 1,
      patch: { diameter: 65 }
    });
    expect(ipc.invoke).toHaveBeenCalledTimes(2);
  });

  it("adopts conflicts without replay and preserves saved state on failure", async () => {
    const wrapper = render();
    await flushPromises();
    ipc.invoke.mockResolvedValueOnce({
      ok: false,
      code: "CONFLICT",
      state: state({ stateSequence: 2, revision: 2 })
    });
    wrapper.getComponent(Checkbox).vm.$emit("update:modelValue", true);
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("другом месте");
    expect(ipc.invoke).toHaveBeenCalledTimes(2);
    expect(wrapper.getComponent(Checkbox).props("modelValue")).toBe(false);
    ipc.invoke.mockRejectedValueOnce(new Error("offline"));
    wrapper.getComponent(Checkbox).vm.$emit("update:modelValue", true);
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("не сохранены");
    expect(wrapper.getComponent(Checkbox).props("modelValue")).toBe(false);
  });

  it("resets only appearance, not enabled", async () => {
    const wrapper = render();
    await flushPromises();
    await wrapper.get("button").trigger("click");
    expect(ipc.invoke).toHaveBeenLastCalledWith("bubble:change", {
      instanceId: "epoch-a",
      revision: 1,
      patch: { diameter: 44, brightness: 65, smoothness: 40 }
    });
  });

  it("does not let an initial response overwrite a new agent epoch", async () => {
    let resolve!: (value: unknown) => void;
    ipc.invoke.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      })
    );
    const wrapper = render();
    publish(
      state({
        instanceId: "epoch-b",
        preferences: { ...DEFAULT_BUBBLE_PREFERENCES, enabled: true }
      })
    );
    resolve({ ok: true, state: state() });
    await flushPromises();
    expect(wrapper.getComponent(Checkbox).props("modelValue")).toBe(true);
  });
});
