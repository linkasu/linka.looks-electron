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
      for (const interactionBlocked of [true, false]) {
        it(`${mode} preserves gaze and specialist mouse contracts while enabled=${enabled}, blocked=${interactionBlocked}`, async () => {
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
            props: {
              config,
              file: "fixture.linka",
              page: 0,
              interactionBlocked,
              showExitButton: true
            },
            global: { plugins: [store], stubs: { SetGridButton: true, VIcon: true } }
          });
          const watcher = new PageWatcher({
            getSettings: () => store.state.button,
            ipcRenderer: { on: vi.fn(), off: vi.fn(), send: vi.fn() }
          });
          try {
            const arrows = wrapper.findAll("button.lock");
            const exitEyes = enabled && !interactionBlocked ? 1 : 0;
            expect(
              wrapper.findAll(".eye").map((button) => button.attributes("aria-label"))
            ).toEqual([
              ...(exitEyes ? ["Вернуться к наборам"] : []),
              ...(mode !== "hidden" && !interactionBlocked
                ? ["Предыдущая страница", "Следующая страница"]
                : [])
            ]);
            if (mode === "hidden") {
              expect(arrows).toHaveLength(0);
              expect(wrapper.findAll(".eye")).toHaveLength(exitEyes);
              return;
            }
            expect(arrows).toHaveLength(2);
            expect(wrapper.findAll(".eye")).toHaveLength(interactionBlocked ? 0 : 2 + exitEyes);
            if (interactionBlocked) {
              for (const arrow of arrows) {
                expect((arrow.element as HTMLButtonElement).disabled).toBe(true);
                (arrow.element as HTMLButtonElement).click();
              }
              expect(wrapper.emitted("update:page")).toBeUndefined();
              expect(store.state.explorer.page).toBe(0);
              return;
            }
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
            watcher.clickWatch(arrows[0].element as HTMLElement, false);
            await wrapper.vm.$nextTick();
            expect(store.state.explorer.page).toBe(0);
            expect(wrapper.emitted("update:page")?.at(-1)).toEqual([0]);
            await wrapper.setProps({ interactionBlocked: true });
            expect((wrapper.findAll("button.lock")[1].element as HTMLButtonElement).disabled).toBe(
              true
            );
            expect(wrapper.findAll(".eye")).toHaveLength(0);
            await wrapper.setProps({ interactionBlocked: false });
            expect(wrapper.findAll(".eye")).toHaveLength(2 + exitEyes);
            store.state.button.enabled = !enabled;
            await wrapper.vm.$nextTick();
            expect(arrows[1].attributes("data-eye-disabled")).toBe(
              !enabled && mode === "mouseAndEyes" ? undefined : "1"
            );
            store.state.button.pageTurnMode = "hidden";
            await wrapper.vm.$nextTick();
            expect(wrapper.findAll(".eye")).toHaveLength(enabled ? 0 : 1);
            store.state.button.pageTurnMode = mode;
            await wrapper.vm.$nextTick();
            expect(wrapper.findAll(".eye")).toHaveLength(enabled ? 2 : 3);
          } finally {
            watcher.destroy();
            wrapper.unmount();
          }
        });
      }
    }
  }
});
