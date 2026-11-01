import { mount } from "@vue/test-utils";
import { createStore } from "vuex";
import { PageWatcher } from "@linkasu/tobii-electron/renderer";
import SetGrid from "@/frontend/components/SetGrid.vue";
import { CardType, type ConfigFile } from "@/common/interfaces/ConfigFile";

describe("page arrows with real gaze watcher and EyeButton", () => {
  beforeAll(() =>
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] })
  );
  afterAll(() => Reflect.deleteProperty(navigator, "getGamepads"));

  for (const mode of ["hidden", "mouseOnly", "mouseAndEyes"]) {
    for (const enabled of [true, false]) {
      it(`${mode} preserves gaze and specialist mouse contracts while enabled=${enabled}`, async () => {
        const store = createStore({
          state: {
            button: {
              pageTurnMode: mode,
              enabled,
              eyeSelect: true,
              eyeActivation: true,
              keyboardActivation: true,
              joystickActivation: true,
              clickSound: false,
              timeout: 1000,
              borders: 1
            },
            explorer: { page: 0 }
          },
          mutations: {
            explorer_page(state, page: number) {
              state.explorer.page = page;
            }
          }
        });
        const config: ConfigFile = {
          version: "3.0",
          withoutSpace: false,
          pages: [0, 1].map((index) => ({
            id: `p${index}`,
            mode: "standard",
            columns: 1,
            rows: 1,
            cards: [{ id: `c${index}`, cardType: CardType.EmptyCard }]
          }))
        };
        const wrapper = mount(SetGrid, {
          attachTo: document.body,
          props: { config, file: "fixture.linka", page: 0 },
          global: { plugins: [store], stubs: { SetGridButton: true, VIcon: true } }
        });
        const watcher = new PageWatcher({
          getSettings: () => store.state.button,
          ipcRenderer: { on: vi.fn(), off: vi.fn(), send: vi.fn() }
        });
        try {
          const arrows = wrapper.findAll("button");
          if (mode === "hidden") {
            expect(arrows).toHaveLength(0);
            expect(wrapper.findAll(".eye")).toHaveLength(0);
            return;
          }
          expect(arrows).toHaveLength(2);
          expect((arrows[1].element as HTMLButtonElement).disabled).toBe(false);
          watcher.enterWatch(arrows[1].element as HTMLElement);
          watcher.clickWatch(arrows[1].element as HTMLElement, true);
          await wrapper.vm.$nextTick();
          expect(wrapper.emitted("update:page")).toEqual(
            enabled && mode === "mouseAndEyes" ? [[1]] : undefined
          );
          await arrows[1].trigger("click");
          expect(store.state.explorer.page).toBe(1);
          expect(wrapper.emitted("update:page")?.at(-1)).toEqual([1]);
          await wrapper.setProps({ interactionBlocked: true });
          expect((wrapper.findAll("button")[1].element as HTMLButtonElement).disabled).toBe(true);
        } finally {
          watcher.destroy();
          wrapper.unmount();
        }
      });
    }
  }
});
