import { flushPromises, mount } from "@vue/test-utils";
import { reactive } from "vue";
import HomeView from "@/frontend/views/HomeView.vue";
import { storageService } from "@/frontend/services/card-storage-service";
import type { Directory } from "@/common/interfaces/Directory";

const push = vi.hoisted(() => vi.fn());

vi.mock("path", () => ({ default: { basename: (path: string) => path.split("/").pop() } }));

vi.mock("vue-router", () => ({
  useRoute: () => route,
  useRouter: () => ({ push })
}));

const route = reactive({ params: { path: "§" } });
const menuFocus = vi.fn();

describe("HomeView folder states", () => {
  beforeEach(() => {
    route.params.path = "§";
    menuFocus.mockClear();
  });
  afterEach(() => vi.restoreAllMocks());
  it.each(["success", "error"])(
    "ignores an obsolete A %s after navigation A → B → A",
    async (outcome) => {
      let finishFirst!: (files: Directory) => void;
      let failFirst!: (error: Error) => void;
      const getFiles = vi.spyOn(storageService, "getFiles");
      getFiles.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            finishFirst = resolve;
            failFirst = reject;
          })
      );
      const wrapper = mountHome();
      getFiles.mockResolvedValueOnce([]);
      route.params.path = "§§B";
      await flushPromises();
      getFiles.mockResolvedValueOnce([{ file: "/sets/current.linka", directory: false }]);
      route.params.path = "§";
      await flushPromises();
      if (outcome === "success") finishFirst([{ file: "/sets/obsolete.linka", directory: false }]);
      else failFirst(new Error("obsolete failure"));
      await flushPromises();
      expect(wrapper.findComponent({ name: "ExplorerGridButton" }).props("file").file).toBe(
        "/sets/current.linka"
      );
      expect(wrapper.find("[role=alert]").exists()).toBe(false);
      wrapper.unmount();
    }
  );

  it("shows loading, reports a storage error, and retries into the empty state", async () => {
    const getFiles = vi
      .spyOn(storageService, "getFiles")
      .mockRejectedValueOnce(new Error("offline"));
    const wrapper = mountHome();

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

  it("disables navigation during assistant menus and dialogs, restores focus and reports rename collision", async () => {
    vi.spyOn(storageService, "getFiles").mockResolvedValue([
      { file: "/sets/original.linka", directory: false }
    ]);
    const rename = vi.spyOn(storageService, "renameItem").mockRejectedValue(new Error("exists"));
    const wrapper = mountHome();
    await flushPromises();
    const trigger = wrapper.get(".item-tools");
    await trigger.trigger("click");
    expect(trigger.attributes("aria-expanded")).toBe("true");
    expect(wrapper.getComponent({ name: "ExplorerGridButton" }).props("disabled")).toBe(true);
    wrapper.getComponent({ name: "VMenu" }).vm.$emit("after-enter");
    expect(menuFocus).toHaveBeenCalledWith("first");
    await wrapper.get('[role="menu"]').trigger("keydown", { key: "Escape" });
    wrapper.getComponent({ name: "VMenu" }).vm.$emit("after-leave");
    expect(document.activeElement).toBe(trigger.element);
    expect(wrapper.getComponent({ name: "ExplorerGridButton" }).props("disabled")).toBe(false);
    await trigger.trigger("click");
    await wrapper
      .findAll('[role="menuitem"]')
      .find((item) => item.text() === "Переименовать")!
      .trigger("click");
    expect(wrapper.getComponent({ name: "ExplorerGridButton" }).props("disabled")).toBe(true);
    await wrapper.get("input").setValue("collision");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(rename).toHaveBeenCalledWith("/sets/original.linka", "collision.linka");
    expect(wrapper.text()).toContain("Ошибка переименования");
    expect(wrapper.find("input").exists()).toBe(false);
    expect(wrapper.getComponent({ name: "ExplorerGridButton" }).props("disabled")).toBe(false);
    wrapper.unmount();
  });

  it("navigates into folders and sets and back to their parent", async () => {
    vi.spyOn(storageService, "getFiles").mockResolvedValue([
      { file: "/sets/Folder", directory: true },
      { file: "/sets/Set.linka", directory: false }
    ]);
    const wrapper = mountHome();
    await flushPromises();
    await wrapper.findAllComponents({ name: "ExplorerGridButton" })[0].trigger("click");
    expect(push).toHaveBeenLastCalledWith("/§§Folder");
    await wrapper.findAllComponents({ name: "ExplorerGridButton" })[1].trigger("click");
    expect(push).toHaveBeenLastCalledWith("/set/§§Set.linka");
    route.params.path = "§§Folder";
    await flushPromises();
    await wrapper.findAllComponents({ name: "ExplorerGridButton" })[0].trigger("click");
    expect(push).toHaveBeenLastCalledWith("/§");
    wrapper.unmount();
  });
});

function mountHome() {
  return mount(HomeView, {
    attachTo: document.body,
    global: {
      stubs: {
        ...Object.fromEntries(
          ["VCardSubtitle", "VCardTitle", "VSelect", "VSpacer"].map((name) => [name, true])
        ),
        VBtn: { template: "<button><slot /></button>" },
        VCard: { template: "<div><slot /></div>" },
        VCardText: { template: "<div><slot /></div>" },
        VCardActions: { template: "<div><slot /></div>" },
        VListItemTitle: { template: "<span><slot /></span>" },
        VListItem: { template: "<button><slot /></button>" },
        VList: {
          name: "VList",
          setup: () => ({ focus: menuFocus }),
          template: "<div><slot /></div>"
        },
        VForm: { template: "<form><slot /></form>" },
        VTextField: {
          props: ["modelValue"],
          emits: ["update:modelValue"],
          template: `<input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`
        },
        EyeButton: {
          props: ["disabled"],
          template: "<button :disabled='disabled'><slot /></button>"
        },
        VDialog: { props: ["modelValue"], template: "<div v-if='modelValue'><slot /></div>" },
        VSnackbar: { props: ["modelValue"], template: "<div v-if='modelValue'><slot /></div>" },
        VMenu: {
          name: "VMenu",
          props: ["modelValue"],
          template: "<div v-if='modelValue'><slot /></div>"
        },
        ExplorerGridButton: {
          name: "ExplorerGridButton",
          props: ["file", "disabled", "back"],
          template: "<button :disabled='disabled'>{{ file?.file }}</button>"
        }
      }
    }
  });
}
