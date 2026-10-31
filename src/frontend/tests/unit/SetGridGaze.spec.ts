import { mount } from "@vue/test-utils";
import { createStore } from "vuex";
import { PageWatcher } from "@linkasu/tobii-electron/renderer";
import SetGrid from "@/frontend/components/SetGrid.vue";
import { CardType, type ConfigFile } from "@/common/interfaces/ConfigFile";

describe("page arrows with the real gaze watcher and EyeButton", () => {
  beforeAll(() => {
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  });
  afterAll(() => {
    Reflect.deleteProperty(navigator, "getGamepads");
  });

  for (const mode of ["hidden", "mouseOnly", "mouseAndEyes"]) {
    it(`handles gaze and click in ${mode} mode`, async () => {
      const store = createStore({
        state: {
          button: {
            pageTurnMode: mode,
            enabled: true,
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
          id: `page-${index}`,
          mode: "standard",
          columns: 1,
          rows: 1,
          cards: [{ id: `card-${index}`, cardType: CardType.EmptyCard }]
        }))
      };
      const wrapper = mount(SetGrid, {
        attachTo: document.body,
        props: { config, file: "test.linka", page: 0 },
        global: {
          plugins: [store],
          stubs: { SetGridButton: true, VIcon: true }
        }
      });
      const watcher = new PageWatcher({
        getSettings: () => store.state.button,
        ipcRenderer: { on: vi.fn(), off: vi.fn(), send: vi.fn() }
      });
      try {
        const arrows = wrapper.findAll("button");
        if (mode === "hidden") {
          expect(arrows).toHaveLength(0);
          expect(document.querySelectorAll(".eye")).toHaveLength(0);
          return;
        }

        const arrow = arrows[1].element as HTMLElement;
        watcher.enterWatch(arrow);
        watcher.clickWatch(arrow, true);
        await wrapper.vm.$nextTick();

        expect(arrows[1].classes().includes("isInside")).toBe(mode === "mouseAndEyes");
        expect(wrapper.emitted("update:page")).toEqual(mode === "mouseAndEyes" ? [[1]] : undefined);

        await arrows[1].trigger("click");
        expect(store.state.explorer.page).toBe(1);
        expect(wrapper.emitted("update:page")?.at(-1)).toEqual([1]);
      } finally {
        watcher.destroy();
        wrapper.unmount();
      }
    });
  }
});
