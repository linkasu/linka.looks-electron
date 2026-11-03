import { flushPromises, mount } from "@vue/test-utils";
import { createStore } from "vuex";
import SetExplorerAppbar from "@/frontend/views/SetExplorerView.appbar.vue";
import { storageService } from "@/frontend/services/card-storage-service";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("path", () => ({ default: { basename: (path: string) => path.split("/").pop() } }));
vi.mock("@/common/constants", () => ({ HOME_DIR: "/sets" }));
vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { path: "§§Игры.linka" }, fullPath: "/set/§§Игры.linka" }),
  useRouter: () => ({ push })
}));
vi.mock("@/frontend/utils/Telemetry", () => ({ Telemetry: { product: vi.fn() } }));

describe("SetExplorer assistant tools", () => {
  function mountAppbar() {
    const store = createStore({
      state: {
        explorer: { config: { pages: [{}] }, page: 0 },
        ui: {
          outputLine: true,
          gazeSuspended: false,
          gazeSuspensions: { tools: false, updater: false }
        },
        button: { enabled: true },
        layoutSettings: { isOpened: false }
      },
      mutations: {
        ui_gazeSuspended(
          state,
          { owner, suspended }: { owner: "tools" | "updater"; suspended: boolean }
        ) {
          state.ui.gazeSuspensions[owner] = suspended;
          state.ui.gazeSuspended =
            state.ui.gazeSuspensions.tools || state.ui.gazeSuspensions.updater;
        },
        button_enabled(state, enabled: boolean) {
          state.button.enabled = enabled;
        }
      }
    });
    const wrapper = mount(SetExplorerAppbar, {
      global: {
        plugins: [store],
        stubs: {
          ...Object.fromEntries(
            [
              "VTextField",
              "VSelect",
              "VToolbar",
              "VToolbarTitle",
              "VToolbarItems",
              "VList",
              "VListItem",
              "VListItemTitle",
              "VSpacer"
            ].map((name) => [name, true])
          ),
          VAppBar: { template: "<header><slot /></header>" },
          VAppBarTitle: { template: "<h1><slot /></h1>" },
          VCard: { template: "<article><slot /></article>" },
          VCardTitle: { template: "<h2><slot /></h2>" },
          VCardText: { template: "<div><slot /></div>" },
          VCardActions: { template: "<div><slot /></div>" },
          VIcon: { template: "<i><slot /></i>" },
          VBtn: { props: ["disabled"], template: '<button :disabled="disabled"><slot /></button>' },
          VDialog: {
            props: ["modelValue"],
            data: () => ({ active: false }),
            template: `<div><slot name="activator" :props="{ onClick: () => { active = true; $emit('update:modelValue', true); } }" /><slot v-if="active || modelValue" :isActive="{ value: active }" /></div>`
          }
        }
      }
    });

    return { wrapper, store };
  }

  beforeEach(() => {
    push.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps direct controls and exposes nested delete confirmation without losing its handler", async () => {
    const trash = vi.spyOn(storageService, "moveToTrash").mockResolvedValue(undefined);
    const { wrapper, store } = mountAppbar();
    expect(wrapper.find("[aria-label='Выключить управление глазами']").exists()).toBe(true);
    expect(wrapper.find("[aria-label='Настройки отображения']").exists()).toBe(true);
    expect(wrapper.get("[aria-label='Редактировать набор']").attributes("to")).toBe(
      "/edit/§§Игры.linka"
    );
    expect(wrapper.text()).not.toContain("Копировать набор");
    await wrapper.get("[aria-label='Инструменты помощника']").trigger("click");
    expect(store.state.button.enabled).toBe(false);
    expect(store.state.ui.gazeSuspended).toBe(true);
    expect(wrapper.text()).toContain("Копировать набор");
    expect(wrapper.text()).toContain("Переместить набор");
    await wrapper.get("[aria-label='Удалить набор']").trigger("click");
    expect(wrapper.text()).toContain("Набор будет перемещён в корзину");
    expect(trash).not.toHaveBeenCalled();
    const confirm = wrapper
      .findAll("button")
      .find((button) => button.text() === "Удалить набор" && !button.attributes("aria-label"))!;
    await confirm.trigger("click");
    await flushPromises();
    expect(trash).toHaveBeenCalledWith("§§Игры.linka");
    expect(push).toHaveBeenCalledWith("/§");
    wrapper.unmount();
    expect(store.state.button.enabled).toBe(true);
    expect(store.state.ui.gazeSuspended).toBe(false);
  });

  it("serializes assistant actions, shows failure, and permits a retry", async () => {
    let fail!: (reason: Error) => void;
    const duplicate = vi
      .spyOn(storageService, "duplicateItem")
      .mockImplementationOnce(
        () =>
          new Promise<string>((_, reject) => {
            fail = reject;
          })
      )
      .mockResolvedValue("/sets/copy.linka");
    const { wrapper } = mountAppbar();
    await wrapper.get("[aria-label='Инструменты помощника']").trigger("click");
    const copy = wrapper.findAll("button").find((button) => button.text() === "Копировать набор")!;
    await copy.trigger("click");
    await copy.trigger("click");
    expect(duplicate).toHaveBeenCalledTimes(1);
    fail(new Error("disk unavailable"));
    await flushPromises();
    expect(wrapper.get("[role='alert']").text()).toContain("Не удалось");
    expect(push).not.toHaveBeenCalled();
    await copy.trigger("click");
    await flushPromises();
    expect(duplicate).toHaveBeenCalledTimes(2);
    expect(wrapper.find("[role='alert']").exists()).toBe(false);
    expect(push).toHaveBeenCalledWith("/set/§copy.linka");
    wrapper.unmount();
  });

  it("shows listing errors and can reopen merge after a successful retry", async () => {
    const list = vi
      .spyOn(storageService, "getFiles")
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValue([]);
    const { wrapper } = mountAppbar();
    await wrapper.get("[aria-label='Инструменты помощника']").trigger("click");
    const merge = wrapper
      .findAll("button")
      .find((button) => button.text() === "Объединить наборы")!;
    await merge.trigger("click");
    await flushPromises();
    expect(wrapper.get("[role='alert']").text()).toContain("Не удалось");
    await merge.trigger("click");
    await flushPromises();
    expect(list).toHaveBeenCalledTimes(2);
    expect(wrapper.find("[role='alert']").exists()).toBe(false);
    expect(wrapper.text()).toContain("В этой папке нет других наборов");
    wrapper.unmount();
  });

  for (const action of ["delete", "move"] as const) {
    it(`handles ${action} failures without navigation and permits a retry`, async () => {
      const operation =
        action === "delete"
          ? vi
              .spyOn(storageService, "moveToTrash")
              .mockRejectedValueOnce(new Error("unavailable"))
              .mockResolvedValue(undefined)
          : vi
              .spyOn(storageService, "moveSet")
              .mockRejectedValueOnce(new Error("unavailable"))
              .mockResolvedValue("/sets/moved.linka");
      const { wrapper } = mountAppbar();
      await wrapper.get("[aria-label='Инструменты помощника']").trigger("click");
      const control = wrapper.getComponent(
        action === "delete" ? { name: "DeleteButton" } : { name: "FolderButton" }
      );
      control.vm.$emit(action, "§target");
      await flushPromises();
      expect(wrapper.get("[role='alert']").text()).toContain("Не удалось");
      expect(push).not.toHaveBeenCalled();
      control.vm.$emit(action, "§target");
      await flushPromises();
      expect(operation).toHaveBeenCalledTimes(2);
      expect(wrapper.find("[role='alert']").exists()).toBe(false);
      expect(push).toHaveBeenCalledOnce();
      wrapper.unmount();
    });
  }

  it("does not skip settings save on unmount while an assistant action is pending", async () => {
    vi.spyOn(storageService, "duplicateItem").mockImplementation(
      () => new Promise<string>(() => {})
    );
    const { wrapper, store } = mountAppbar();
    const save = vi.fn(async () => undefined);
    store.hotUpdate({
      actions: { editor_save: save, toggle_settings_opened: vi.fn(() => undefined) }
    });
    store.state.layoutSettings.isOpened = true;
    await wrapper.get("[aria-label='Инструменты помощника']").trigger("click");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Копировать набор")!
      .trigger("click");
    wrapper.unmount();
    await flushPromises();
    expect(save).toHaveBeenCalledOnce();
  });

  it("releases only tools ownership on unmount and preserves an explicit user pause", async () => {
    const { wrapper, store } = mountAppbar();
    store.commit("button_enabled", false);
    await wrapper.get("[aria-label='Инструменты помощника']").trigger("click");
    store.commit("ui_gazeSuspended", { owner: "updater", suspended: true });
    wrapper.unmount();
    expect(store.state.ui.gazeSuspensions).toEqual({ tools: false, updater: true });
    expect(store.state.ui.gazeSuspended).toBe(true);
    expect(store.state.button.enabled).toBe(false);
    store.commit("ui_gazeSuspended", { owner: "updater", suspended: false });
    expect(store.state.ui.gazeSuspended).toBe(false);
    expect(store.state.button.enabled).toBe(false);
  });
});
