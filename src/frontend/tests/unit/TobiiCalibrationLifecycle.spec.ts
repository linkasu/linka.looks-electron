import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, shallowMount, type VueWrapper } from "@vue/test-utils";
import { defineComponent } from "vue";
import TobiiCalibrationView from "@/frontend/views/TobiiCalibrationView.vue";
import { Telemetry } from "@/frontend/utils/Telemetry";

const { invoke, on, off, push, commit, settings } = vi.hoisted(() => ({
  invoke: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  push: vi.fn(),
  commit: vi.fn(),
  settings: { animation: false }
}));
vi.mock("electron", () => ({ ipcRenderer: { invoke, on, off } }));
vi.mock("vue-router", () => ({
  useRoute: () => ({ query: { first: "1" } }),
  useRouter: () => ({ back: vi.fn(), push })
}));
vi.mock("@/frontend/store", () => ({
  default: { state: { button: settings }, commit }
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

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("Tobii calibration UI lifecycle", () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    settings.animation = false;
    invoke.mockImplementation((channel: string) =>
      Promise.resolve(
        channel === "tobii:status:get" ? { state: "tracking", deviceFound: true } : true
      )
    );
  });

  afterEach(() => {
    if (wrapper?.exists()) wrapper.unmount();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  async function mountView() {
    wrapper = shallowMount(TobiiCalibrationView, {
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
  }

  async function click(label: string) {
    const button = wrapper.findAll("button").find((item) => item.text().includes(label));
    expect(button, label).toBeDefined();
    await button!.trigger("click");
    await flushPromises();
  }

  async function finishPoints() {
    for (let index = 0; index < 6; index += 1) {
      await wrapper.get(".is-holding").trigger("click");
      await vi.advanceTimersByTimeAsync(280);
      if (index === 2) await vi.advanceTimersByTimeAsync(120);
      await flushPromises();
    }
  }

  it.each(["success", "error"])(
    "ignores a cancelled start %s during a newer pending run",
    async (reply) => {
      const oldStart = deferred();
      const newStart = deferred();
      await mountView();
      invoke.mockImplementationOnce(() => oldStart.promise);
      await click("Начать калибровку");
      await click("Отменить");
      invoke.mockImplementationOnce(() => newStart.promise);
      await click("Начать калибровку");
      if (reply === "success") oldStart.resolve();
      else oldStart.reject(new Error("old start failed"));
      await flushPromises();
      expect(wrapper.get('[role="status"]').text()).toBe("Подготовка…");
      expect(wrapper.find(".is-holding").exists()).toBe(false);
      expect(commit).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
    }
  );

  it.each(["success", "error"])(
    "ignores a cancelled finish %s without completing first-flow",
    async (reply) => {
      const finish = deferred();
      const defaultInvoke = invoke.getMockImplementation()!;
      invoke.mockImplementation((channel: string) =>
        channel === "tobii:calibration:finish" ? finish.promise : defaultInvoke(channel)
      );
      await mountView();
      await click("Начать калибровку");
      await finishPoints();
      expect(wrapper.get('[role="status"]').text()).toBe("Сохранение…");
      await click("Отменить");
      if (reply === "success") finish.resolve();
      else finish.reject(new Error("old finish failed"));
      await flushPromises();
      expect(commit).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
      expect(wrapper.text()).toContain("Калибровка Tobii отменена.");
      expect(wrapper.text()).not.toContain("сохранена и применена");
      expect(wrapper.text()).not.toContain("old finish failed");
    }
  );

  it.each(["success", "error"])("ignores an old add-point %s after a new run", async (reply) => {
    const point = deferred();
    await mountView();
    await click("Начать калибровку");
    invoke.mockImplementationOnce(() => point.promise);
    await wrapper.get(".is-holding").trigger("click");
    await click("Отменить");
    await click("Начать калибровку");
    if (reply === "success") point.resolve();
    else point.reject(new Error("old point failed"));
    await vi.advanceTimersByTimeAsync(280);
    await flushPromises();
    expect(wrapper.get(".is-holding").attributes("style")).toContain("left: 50%");
    expect(wrapper.findAll(".calibration-target")).toHaveLength(3);
    expect(wrapper.text()).not.toContain("old point failed");
  });

  it.each([
    ["start", "success"],
    ["start", "error"],
    ["add-point", "success"],
    ["add-point", "error"],
    ["finish", "success"],
    ["finish", "error"],
    ["apply-saved", "success"],
    ["apply-saved", "error"]
  ])("ignores a pending %s %s after unmount and removes active timers", async (command, reply) => {
    const pending = deferred<boolean>();
    const defaultInvoke = invoke.getMockImplementation()!;
    invoke.mockImplementation((channel: string) =>
      channel === `tobii:calibration:${command}` ? pending.promise : defaultInvoke(channel)
    );
    await mountView();
    await click(command === "apply-saved" ? "Применить сохранённую" : "Начать калибровку");
    if (command === "add-point") await wrapper.get(".is-holding").trigger("click");
    if (command === "finish") await finishPoints();
    wrapper.unmount();
    const callsBeforeReply = invoke.mock.calls.length;
    vi.mocked(Telemetry.product).mockClear();
    vi.mocked(Telemetry.outcome).mockClear();
    if (reply === "success") pending.resolve(true);
    else pending.reject(new Error("unmounted request failed"));
    await flushPromises();
    await vi.advanceTimersByTimeAsync(30000);
    expect(invoke).toHaveBeenCalledTimes(callsBeforeReply);
    expect(commit).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(Telemetry.product).not.toHaveBeenCalled();
    expect(Telemetry.outcome).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores a previous finish finally while a new start is pending", async () => {
    const finish = deferred();
    const newStart = deferred();
    const defaultInvoke = invoke.getMockImplementation()!;
    invoke.mockImplementation((channel: string) =>
      channel === "tobii:calibration:finish" ? finish.promise : defaultInvoke(channel)
    );
    await mountView();
    await click("Начать калибровку");
    await finishPoints();
    await click("Отменить");
    invoke.mockImplementationOnce(() => newStart.promise);
    await click("Начать калибровку");
    finish.resolve();
    await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toBe("Подготовка…");
    expect(commit).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("does not advance the old group pause into a newer pending start", async () => {
    await mountView();
    await click("Начать калибровку");
    for (let index = 0; index < 3; index += 1) {
      await wrapper.get(".is-holding").trigger("click");
      await vi.advanceTimersByTimeAsync(280);
    }
    await click("Отменить");
    invoke.mockImplementationOnce(() => deferred().promise);
    await click("Начать калибровку");
    await vi.advanceTimersByTimeAsync(120);
    expect(wrapper.get('[role="status"]').text()).toBe("Подготовка…");
    expect(wrapper.find(".is-holding").exists()).toBe(false);
    expect(wrapper.findAll(".calibration-target")[0].attributes("style")).toContain("left: 50%");
  });

  it("applies a saved calibration and completes first-flow once", async () => {
    await mountView();
    await click("Применить сохранённую");
    expect(wrapper.text()).toContain("Сохранённая калибровка применена.");
    expect(commit).toHaveBeenCalledExactlyOnceWith("first_calibrate", true);
    expect(push).toHaveBeenCalledExactlyOnceWith("/");
  });

  it.each(["missing", "error"])(
    "reports apply-saved %s and permits another attempt",
    async (reply) => {
      await mountView();
      if (reply === "missing") invoke.mockResolvedValueOnce(false);
      else invoke.mockRejectedValueOnce(new Error("saved calibration failed"));
      await click("Применить сохранённую");
      expect(wrapper.text()).toContain(
        reply === "missing" ? "Сохранённая калибровка пока не найдена." : "saved calibration failed"
      );
      expect(commit).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
      await click("Начать калибровку");
      expect(wrapper.find(".is-holding").exists()).toBe(true);
    }
  );

  it("does not duplicate an apply-saved request and invalidates it when skipping first-flow", async () => {
    const saved = deferred<boolean>();
    await mountView();
    invoke.mockImplementationOnce(() => saved.promise);
    await click("Применить сохранённую");
    await click("Применить сохранённую");
    await click("Начать калибровку");
    expect(
      invoke.mock.calls.filter(([channel]) => channel === "tobii:calibration:apply-saved")
    ).toHaveLength(1);
    expect(invoke).not.toHaveBeenCalledWith("tobii:calibration:start");
    await click("Пропустить");
    expect(commit).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(1);
    saved.resolve(true);
    await flushPromises();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("can start again after Escape and cancels settle and hold timers", async () => {
    await mountView();
    await click("Начать калибровку");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();
    await vi.advanceTimersByTimeAsync(5000);
    expect(invoke).not.toHaveBeenCalledWith("tobii:calibration:add-point", expect.anything());
    await click("Начать калибровку");
    await vi.advanceTimersByTimeAsync(900);
    await click("Отменить");
    await vi.advanceTimersByTimeAsync(5000);
    expect(invoke).not.toHaveBeenCalledWith("tobii:calibration:add-point", expect.anything());
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([false, true])(
    "preserves automatic six-point timing with animation=%s without gaze events",
    async (animation) => {
      settings.animation = animation;
      await mountView();
      expect(wrapper.text()).toContain("Если отвести взгляд, таймер не остановится.");
      await click("Начать калибровку");
      expect(wrapper.get(".calibration-stage").classes().includes("no-animation")).toBe(!animation);
      await vi.advanceTimersByTimeAsync(2399);
      expect(invoke).not.toHaveBeenCalledWith("tobii:calibration:add-point", expect.anything());
      await vi.advanceTimersByTimeAsync(17);
      expect(
        invoke.mock.calls.filter(([channel]) => channel === "tobii:calibration:add-point")
      ).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(18000);
      await flushPromises();
      expect(
        invoke.mock.calls
          .filter(([channel]) => channel === "tobii:calibration:add-point")
          .map(([, point]) => point)
      ).toEqual([
        { x: 0.5, y: 0.22 },
        { x: 0.24, y: 0.72 },
        { x: 0.76, y: 0.72 },
        { x: 0.24, y: 0.28 },
        { x: 0.76, y: 0.28 },
        { x: 0.5, y: 0.78 }
      ]);
      expect(invoke).toHaveBeenCalledWith("tobii:calibration:finish");
      expect(commit).toHaveBeenCalledWith("first_calibrate", true);
      expect(push).toHaveBeenCalledWith("/");
    }
  );
});
