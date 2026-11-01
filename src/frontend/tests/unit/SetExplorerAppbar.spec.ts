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
  it("keeps direct controls and exposes nested delete confirmation without losing its handler", async () => {
    const trash = vi.spyOn(storageService, "moveToTrash").mockResolvedValue(undefined);
    const store = createStore({
      state: {
        explorer: { config: { pages: [{}] }, page: 0 },
        ui: { outputLine: true, gazeSuspended: false },
        button: { enabled: true },
        layoutSettings: { isOpened: false }
      },
      mutations: {
        ui_gazeSuspended(state, suspended: boolean) {
          state.ui.gazeSuspended = suspended;
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
          VBtn: { template: "<button><slot /></button>" },
          VDialog: {
            props: ["modelValue"],
            data: () => ({ active: false }),
            template: `<div><slot name="activator" :props="{ onClick: () => { active = true; $emit('update:modelValue', true); } }" /><slot v-if="active || modelValue" :isActive="{ value: active }" /></div>`
          }
        }
      }
    });

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
});
