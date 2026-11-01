import { flushPromises, shallowMount } from "@vue/test-utils";
import { createStore } from "vuex";
import SetExplorer from "@/frontend/views/SetExplorerView.vue";
import SetGrid from "@/frontend/components/SetGrid.vue";
import QuizOutputLine from "@/frontend/components/QuizOutputLine.vue";
import { CardType } from "@/common/interfaces/ConfigFile";

const audio = vi.hoisted(() => ({ forcePlayText: vi.fn(), playCards: vi.fn() }));
vi.mock("@/frontend/utils/TTS", () => ({ TTS: { instance: audio } }));
vi.mock("@/frontend/utils/Telemetry", () => ({ Telemetry: { product: vi.fn() } }));
vi.mock("vue-router", () => ({ useRoute: () => ({ params: { path: "§quiz.linka" } }) }));

const wrong = { id: "wrong", cardType: CardType.AudioCard, title: "Нет" };
const right = { id: "right", cardType: CardType.AudioCard, title: "Да", answer: true };

async function mountQuiz(quizAutoNext = false) {
  const config = {
    version: "3.0",
    quizAutoNext,
    pages: [0, 1].map((index) => ({
      id: `page-${index}`,
      mode: "quiz",
      rows: 1,
      columns: 2,
      cards: [wrong, right]
    }))
  };
  const store = createStore({
    state: {
      explorer: { config: undefined as typeof config | undefined, page: 0 },
      layoutSettings: { isOpened: false },
      ui: { outputLine: true, exitButton: true },
      editor: { pages: [] }
    },
    mutations: {
      explorer_config(state, value) {
        state.explorer.config = value;
      },
      explorer_page(state, value) {
        state.explorer.page = value;
      }
    },
    actions: {
      open_file({ commit }) {
        commit("explorer_config", config);
      },
      editor_current: vi.fn()
    }
  });
  const wrapper = shallowMount(SetExplorer, {
    global: {
      plugins: [store],
      stubs: { VLayout: { template: "<div><slot /></div>" }, VIcon: true, VProgressCircular: true }
    }
  });
  await flushPromises();
  return { wrapper, store };
}

beforeEach(() => {
  audio.forcePlayText.mockReset().mockResolvedValue(undefined);
});

it("keeps visible wrong-answer feedback and allows retry even when speech fails", async () => {
  const { wrapper, store } = await mountQuiz();
  audio.forcePlayText.mockRejectedValueOnce(new Error("unavailable"));
  wrapper.getComponent(SetGrid).vm.$emit("card", wrong, 0);
  await flushPromises();
  expect(wrapper.getComponent(QuizOutputLine).props("feedback")).toContain("Озвучка недоступна");
  expect(wrapper.getComponent(QuizOutputLine).props("errors")).toBe(1);
  expect(wrapper.getComponent(SetGrid).props("interactionBlocked")).toBe(false);
  expect(store.state.explorer.page).toBe(0);
  wrapper.unmount();
});

it("serializes answer feedback and preserves configured auto-next for a wrong answer", async () => {
  const { wrapper, store } = await mountQuiz(true);
  let complete!: () => void;
  audio.forcePlayText.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      })
  );
  wrapper.getComponent(SetGrid).vm.$emit("card", wrong, 0);
  wrapper.getComponent(SetGrid).vm.$emit("card", right, 1);
  await flushPromises();
  expect(audio.forcePlayText).toHaveBeenCalledOnce();
  expect(wrapper.getComponent(SetGrid).props("interactionBlocked")).toBe(true);
  expect(store.state.explorer.page).toBe(0);
  complete();
  await flushPromises();
  expect(store.state.explorer.page).toBe(1);
  expect(wrapper.getComponent(QuizOutputLine).props("errors")).toBe(1);
  wrapper.unmount();
});
