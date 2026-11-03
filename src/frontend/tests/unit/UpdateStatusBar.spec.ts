import { flushPromises, mount } from "@vue/test-utils";
import { ipcRenderer } from "electron";
import { createStore } from "vuex";
import UpdateStatusBar from "@/frontend/components/UpdateStatusBar.vue";

vi.mock("electron", () => ({
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), off: vi.fn(), send: vi.fn() }
}));
vi.mock("@/frontend/utils/Telemetry", () => ({ Telemetry: { product: vi.fn() } }));

function setup() {
  const store = createStore({
    state: { ui: { gazeSuspended: false, gazeSuspensions: { tools: false, updater: false } } },
    mutations: {
      ui_gazeSuspended: (
        state,
        { owner, suspended }: { owner: "tools" | "updater"; suspended: boolean }
      ) => {
        state.ui.gazeSuspensions[owner] = suspended;
        state.ui.gazeSuspended = state.ui.gazeSuspensions.tools || state.ui.gazeSuspensions.updater;
      }
    }
  });
  const wrapper = mount(UpdateStatusBar, {
    global: {
      plugins: [store],
      stubs: {
        VDialog: { props: ["modelValue"], template: "<div v-if='modelValue'><slot /></div>" },
        VCard: { template: "<article><slot /></article>" },
        VCardTitle: { template: "<h2><slot /></h2>" },
        VCardText: { template: "<div><slot /></div>" },
        VCardActions: { template: "<div><slot /></div>" },
        VBtn: { template: "<button><slot /></button>" },
        VSpacer: true
      }
    }
  });
  return { store, wrapper };
}

function emit(channel: string, data?: unknown) {
  const listener = vi.mocked(ipcRenderer.on).mock.calls.find(([name]) => name === channel)![1];
  listener(Object.assign(new Event(channel), { ports: [], sender: ipcRenderer }), data);
}

describe("UpdateStatusBar", () => {
  beforeEach(() => vi.resetAllMocks());
  it("does not interrupt a task and restarts only after explicit confirmation", async () => {
    vi.mocked(ipcRenderer.invoke)
      .mockResolvedValueOnce({ version: "1.2.3" })
      .mockResolvedValueOnce({
        available: false,
        downloaded: true,
        error: "",
        percent: 100
      });
    const { store, wrapper } = setup();
    await flushPromises();

    expect(wrapper.text()).not.toContain("Установка перезапустит приложение");
    expect(ipcRenderer.send).not.toHaveBeenCalled();
    await wrapper.get(".status-action").trigger("click");
    expect(store.state.ui.gazeSuspended).toBe(true);
    expect(wrapper.text()).toContain("Установка перезапустит приложение");
    const later = wrapper.findAll("button").find((button) => button.text() === "Позже")!;
    await later.trigger("click");
    expect(store.state.ui.gazeSuspended).toBe(false);
    expect(wrapper.find(".status-action").exists()).toBe(true);
    expect(ipcRenderer.send).not.toHaveBeenCalled();
    await wrapper.get(".status-action").trigger("click");
    const install = wrapper
      .findAll("button")
      .find((button) => button.text() === "Установить и перезапустить")!;
    await install.trigger("click");
    expect(ipcRenderer.send).toHaveBeenCalledWith("restart_app");
    await wrapper.get(".status-action").trigger("click");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Установить и перезапустить")!
      .trigger("click");
    expect(ipcRenderer.send).toHaveBeenCalledTimes(1);
    wrapper.unmount();
    expect(store.state.ui.gazeSuspended).toBe(false);
    expect(ipcRenderer.off).toHaveBeenCalledTimes(4);
  });

  it("subscribes before awaiting version and does not overwrite live events with a stale snapshot", async () => {
    let resolveVersion!: (value: unknown) => void;
    let resolveState!: (value: unknown) => void;
    vi.mocked(ipcRenderer.invoke).mockImplementation((channel) =>
      channel === "app_version"
        ? new Promise((resolve) => {
            resolveVersion = resolve;
          })
        : new Promise((resolve) => {
            resolveState = resolve;
          })
    );
    const { wrapper } = setup();
    expect(ipcRenderer.on).toHaveBeenCalledTimes(4);
    emit("update_downloaded");
    resolveVersion({ version: "4.0.0" });
    await flushPromises();
    resolveState({ available: true, downloaded: false, error: "", percent: 42 });
    await flushPromises();
    expect(wrapper.text()).toContain("4.0.0");
    expect(wrapper.text()).toContain("Обновление готово");
    expect(wrapper.text()).not.toContain("Загрузка обновления");
    expect(wrapper.text()).not.toContain("Установка перезапустит");
    wrapper.unmount();
  });

  it("handles failed initial requests and continues receiving live errors", async () => {
    vi.mocked(ipcRenderer.invoke).mockRejectedValue(new Error("offline"));
    const { store, wrapper } = setup();
    await flushPromises();
    expect(wrapper.text()).toContain("Ошибка обновления");
    emit("update_error", "Download failed");
    await wrapper.vm.$nextTick();
    await wrapper.get(".status-action").trigger("click");
    expect(wrapper.text()).toContain("Download failed");
    expect(store.state.ui.gazeSuspended).toBe(true);
    wrapper.unmount();
    expect(store.state.ui.gazeSuspended).toBe(false);
  });

  it("retains snapshot fields not superseded by live progress", async () => {
    let resolveState!: (value: unknown) => void;
    vi.mocked(ipcRenderer.invoke).mockImplementation((channel) =>
      channel === "app_version"
        ? Promise.resolve({ version: "4.0.0" })
        : new Promise((resolve) => {
            resolveState = resolve;
          })
    );
    const { wrapper } = setup();
    emit("update_info", { percent: 75 });
    resolveState({ available: true, downloaded: false, error: "", percent: 10 });
    await flushPromises();
    expect(wrapper.text()).toContain("Загрузка обновления: 75.0%");
    wrapper.unmount();
  });

  it("loads updater state even if the version request fails", async () => {
    vi.mocked(ipcRenderer.invoke).mockImplementation((channel) =>
      channel === "app_version"
        ? Promise.reject(new Error("version unavailable"))
        : Promise.resolve({ available: false, downloaded: true, error: "", percent: 100 })
    );
    const { wrapper } = setup();
    await flushPromises();
    expect(wrapper.text()).toContain("Обновление готово");
    expect(wrapper.text()).toContain("неизвестна");
    wrapper.unmount();
  });

  it("preserves an existing gaze suspension when its dialog closes", async () => {
    vi.mocked(ipcRenderer.invoke)
      .mockResolvedValueOnce({ version: "4.0.0" })
      .mockResolvedValueOnce({ available: false, downloaded: true, error: "", percent: 100 });
    const { store, wrapper } = setup();
    store.commit("ui_gazeSuspended", { owner: "tools", suspended: true });
    await flushPromises();
    await wrapper.get(".status-action").trigger("click");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Позже")!
      .trigger("click");
    expect(store.state.ui.gazeSuspended).toBe(true);
    wrapper.unmount();
    expect(store.state.ui.gazeSuspended).toBe(true);
  });

  it("does not add listeners after unmount while initial requests are pending", async () => {
    let resolveVersion!: (value: unknown) => void;
    vi.mocked(ipcRenderer.invoke).mockImplementation((channel) =>
      channel === "app_version"
        ? new Promise((resolve) => {
            resolveVersion = resolve;
          })
        : Promise.resolve({ available: false, downloaded: false, error: "", percent: 0 })
    );
    const { wrapper } = setup();
    wrapper.unmount();
    resolveVersion({ version: "4.0.0" });
    await flushPromises();
    for (const [channel, listener] of vi.mocked(ipcRenderer.on).mock.calls) {
      expect(ipcRenderer.off).toHaveBeenCalledWith(channel, listener);
    }
    expect(ipcRenderer.on).toHaveBeenCalledTimes(4);
  });

  it("releases only updater ownership on unmount while tools are open", async () => {
    vi.mocked(ipcRenderer.invoke)
      .mockResolvedValueOnce({ version: "4.0.0" })
      .mockResolvedValueOnce({ available: false, downloaded: true, error: "", percent: 100 });
    const { store, wrapper } = setup();
    await flushPromises();
    await wrapper.get(".status-action").trigger("click");
    store.commit("ui_gazeSuspended", { owner: "tools", suspended: true });
    wrapper.unmount();
    expect(store.state.ui.gazeSuspensions).toEqual({ tools: true, updater: false });
    expect(store.state.ui.gazeSuspended).toBe(true);
    store.commit("ui_gazeSuspended", { owner: "tools", suspended: false });
    expect(store.state.ui.gazeSuspended).toBe(false);
  });
});
