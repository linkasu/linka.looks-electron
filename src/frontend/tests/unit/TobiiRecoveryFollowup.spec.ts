import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { defineComponent } from "vue";
import TobiiCalibrationView from "@/frontend/views/TobiiCalibrationView.vue";

const { invoke, on, off } = vi.hoisted(() => ({
  invoke: vi.fn(),
  on: vi.fn(),
  off: vi.fn()
}));
vi.mock("electron", () => ({ ipcRenderer: { invoke, on, off } }));
vi.mock("vue-router", () => ({
  useRoute: () => ({ query: { first: "1" } }),
  useRouter: () => ({ back: vi.fn(), push: vi.fn() })
}));
vi.mock("@/frontend/store", () => ({
  default: { state: { button: { animation: false } }, commit: vi.fn() }
}));
vi.mock("@/frontend/plugins/platform", () => ({ platform: { isMacOS: true } }));
vi.mock("@/frontend/utils/Telemetry", () => ({
  Telemetry: { product: vi.fn(), outcome: vi.fn() }
}));

const Slot = defineComponent({ template: "<div><slot /></div>" });
const Button = defineComponent({
  props: ["disabled"],
  template: '<button :disabled="disabled"><slot /></button>'
});

describe("Tobii recovery follow-up", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps calibration unavailable until a real ready status arrives and discloses technical errors", async () => {
    invoke.mockResolvedValueOnce({
      state: "waiting_device",
      deviceFound: false,
      message: "Waiting for USB vid=0x2104 pid=0x0127",
      lastError: "USB open failed"
    });
    const wrapper = shallowMount(TobiiCalibrationView, {
      global: {
        stubs: {
          "v-container": Slot,
          "v-card": Slot,
          "v-card-title": Slot,
          "v-card-text": Slot,
          "v-card-actions": Slot,
          "v-alert": Slot,
          "v-btn": Button,
          "v-spacer": true
        },
        renderStubDefaultSlot: true
      }
    });
    await flushPromises();
    expect(invoke).toHaveBeenCalledWith("tobii:status:get");
    expect(wrapper.get('[data-testid="tobii-device-found"]').text()).toBe("пока не найдено");
    expect(wrapper.get('[data-testid="tobii-readiness"]').text()).not.toContain("vid=");
    expect(wrapper.text()).not.toContain("Tobii подключён.");
    expect(
      wrapper.get('[data-testid="tobii-start-calibration"]').attributes("disabled")
    ).toBeDefined();
    expect(wrapper.get("details").text()).toContain("vid=0x2104");
    expect(wrapper.get("details").text()).toContain("USB open failed");
    expect(wrapper.get("details").attributes("open")).toBeUndefined();
    expect(wrapper.get("ol").text()).toContain("продолжит поиск автоматически");
    expect(wrapper.get("ol").text()).toContain("Закрепите устройство под экраном");

    const update = on.mock.calls.find(([channel]) => channel === "tobii:status")![1];
    update({}, { state: "connecting", deviceFound: true });
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-testid="tobii-device-found"]').text()).toBe("найдено");
    expect(wrapper.get('[data-testid="tobii-readiness"]').text()).toContain("ещё не готово");
    expect(
      wrapper.get('[data-testid="tobii-start-calibration"]').attributes("disabled")
    ).toBeDefined();

    update({}, { state: "tracking", deviceFound: true });
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-testid="tobii-readiness"]').text()).toContain("Можно начать");
    expect(
      wrapper.get('[data-testid="tobii-start-calibration"]').attributes("disabled")
    ).toBeUndefined();
    expect(wrapper.text()).toContain("Tobii подключён.");
    expect(invoke).toHaveBeenCalledTimes(1);
    wrapper.unmount();
    expect(off).toHaveBeenCalledWith("tobii:status", update);
  });
});
