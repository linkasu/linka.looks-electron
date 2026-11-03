import { flushPromises, mount } from "@vue/test-utils";
import { reactive } from "vue";
import HomeView from "@/frontend/views/HomeView.vue";
import { storageService } from "@/frontend/services/card-storage-service";

const push = vi.hoisted(() => vi.fn());

vi.mock("path", () => ({ default: { basename: (path: string) => path.split("/").pop() } }));

vi.mock("vue-router", () => ({
  useRoute: () => route,
  useRouter: () => ({ push })
}));

const route = reactive({ params: { path: "§" } });

describe("HomeView folder states", () => {
  it("shows loading, reports a storage error, and retries into the empty state", async () => {
    const getFiles = vi
      .spyOn(storageService, "getFiles")
      .mockRejectedValueOnce(new Error("offline"));
    const wrapper = mount(HomeView, {
      global: {
        stubs: {
          ...Object.fromEntries(
            [
              "VCardSubtitle",
              "VListItemTitle",
              "VListItem",
              "VList",
              "VCard",
              "VCardTitle",
              "VTextField",
              "VSelect",
              "VCardText",
              "VCardActions",
              "VForm"
            ].map((name) => [name, true])
          ),
          VBtn: { template: "<button><slot /></button>" },
          EyeButton: {
            props: ["disabled"],
            template: "<button :disabled='disabled'><slot /></button>"
          },
          VDialog: { props: ["modelValue"], template: "<div v-if='modelValue'><slot /></div>" },
          VSnackbar: { props: ["modelValue"], template: "<div v-if='modelValue'><slot /></div>" },
          VMenu: { props: ["modelValue"], template: "<div v-if='modelValue'><slot /></div>" },
          ExplorerGridButton: true
        }
      }
    });

    expect(wrapper.text()).toContain("Загрузка наборов");
    await flushPromises();
    expect(wrapper.get("[role=alert]").text()).toContain("Не удалось открыть папку");
    getFiles.mockResolvedValueOnce([]);
    await wrapper.get("[role=alert] button").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("В этой папке пока нет наборов");
    expect(wrapper.find("[role=alert]").exists()).toBe(false);
    const typingButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "Печать глазами");
    await typingButton!.trigger("click");
    expect(push).toHaveBeenCalledWith("/eye-typing");
    getFiles.mockResolvedValueOnce([]);
    route.params.path = "§§Миша";
    await flushPromises();
    expect(getFiles).toHaveBeenLastCalledWith("§§Миша");
    expect(wrapper.get(".folder-heading").text()).toContain("Наборы / Миша");
    expect(wrapper.find(".typing-entry").exists()).toBe(false);
    wrapper.unmount();
  });
});
