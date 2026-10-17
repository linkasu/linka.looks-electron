import { flushPromises, mount } from "@vue/test-utils";
import { ipcRenderer } from "electron";
import UpdateStatusBar from "@/frontend/components/UpdateStatusBar.vue";

vi.mock("electron", () => ({
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), off: vi.fn(), send: vi.fn() }
}));
vi.mock("@/frontend/utils/Telemetry", () => ({ Telemetry: { product: vi.fn() } }));

describe("UpdateStatusBar", () => {
  it("does not interrupt a task and restarts only after explicit confirmation", async () => {
    vi.mocked(ipcRenderer.invoke)
      .mockResolvedValueOnce({ version: "1.2.3" })
      .mockResolvedValueOnce({
        available: false,
        downloaded: true,
        error: "",
        percent: 100
      });
    const wrapper = mount(UpdateStatusBar, {
      global: {
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
    await flushPromises();

    expect(wrapper.text()).not.toContain("Установка перезапустит приложение");
    expect(ipcRenderer.send).not.toHaveBeenCalled();
    await wrapper.get(".status-action").trigger("click");
    expect(wrapper.text()).toContain("Установка перезапустит приложение");
    const later = wrapper.findAll("button").find((button) => button.text() === "Позже")!;
    await later.trigger("click");
    expect(wrapper.find(".status-action").exists()).toBe(true);
    expect(ipcRenderer.send).not.toHaveBeenCalled();
    await wrapper.get(".status-action").trigger("click");
    const install = wrapper
      .findAll("button")
      .find((button) => button.text() === "Установить и перезапустить")!;
    await install.trigger("click");
    expect(ipcRenderer.send).toHaveBeenCalledWith("restart_app");
    wrapper.unmount();
    expect(ipcRenderer.off).toHaveBeenCalledTimes(4);
  });
});
