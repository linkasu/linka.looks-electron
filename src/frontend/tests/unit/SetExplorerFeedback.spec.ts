import { flushPromises, shallowMount } from "@vue/test-utils";
import { createStore } from "vuex";
import SetExplorer from "@/frontend/views/SetExplorerView.vue";
import SetGrid from "@/frontend/components/SetGrid.vue";
import QuizOutputLine from "@/frontend/components/QuizOutputLine.vue";
import MatchOutputLine from "@/frontend/components/MatchOutputLine.vue";
import { CardType, type ConfigFile, type Card } from "@/common/interfaces/ConfigFile";

const audio = vi.hoisted(() => ({ forcePlayText: vi.fn(), playCards: vi.fn() }));
vi.mock("@/frontend/utils/TTS", () => ({ TTS: { instance: audio } }));
vi.mock("@/frontend/utils/Telemetry", () => ({ Telemetry: { product: vi.fn() } }));
vi.mock("vue-router", () => ({ useRoute: () => ({ params: { path: "§quiz.linka" } }) }));

const wrong = { id: "wrong", cardType: CardType.AudioCard, title: "Нет" };
const right: Card = { id: "right", cardType: CardType.AudioCard, title: "Да", answer: true };

async function mountQuiz(quizAutoNext = false) {
  return mountSet({
    version: "3.0",
    withoutSpace: false,
    quizAutoNext,
    pages: [0, 1].map((index) => ({
      id: `page-${index}`,
      mode: "quiz",
      rows: 1,
      columns: 2,
      cards: [wrong, right]
    }))
  });
}

async function mountSet(config: ConfigFile) {
  const store = createStore({
    state: {
      setLoadRevision: 0,
      explorer: { config: undefined as typeof config | undefined, page: 0 },
      layoutSettings: { isOpened: false },
      ui: { outputLine: true, exitButton: true },
      editor: { pages: [] }
    },
    mutations: {
      set_load_invalidate(state, owner?: number) {
        if (owner === undefined || owner === state.setLoadRevision) state.setLoadRevision++;
      },
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
  audio.playCards.mockReset().mockResolvedValue(undefined);
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

it("does not apply old answer speech completion to a replacement set", async () => {
  const { wrapper, store } = await mountQuiz(true);
  let complete!: () => void;
  audio.forcePlayText.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      })
  );
  wrapper.getComponent(SetGrid).vm.$emit("card", wrong, 0);
  store.commit("explorer_config", { ...store.state.explorer.config, description: "B" });
  await flushPromises();
  complete();
  await flushPromises();
  expect(store.state.explorer.page).toBe(0);
  expect(wrapper.getComponent(QuizOutputLine).props("feedback")).toBe("");
  expect(wrapper.getComponent(SetGrid).props("interactionBlocked")).toBe(false);
  wrapper.unmount();
});

it("retains first match selection, counts one error and recovers when card speech fails", async () => {
  const cards: Card[] = [
    { id: "top-a", cardType: CardType.AudioCard, matchId: "a" },
    { id: "top-b", cardType: CardType.AudioCard, matchId: "b" },
    { id: "bottom-a", cardType: CardType.AudioCard, matchId: "a" },
    { id: "bottom-b", cardType: CardType.AudioCard, matchId: "b" }
  ];
  const { wrapper } = await mountSet({
    version: "3.0",
    withoutSpace: false,
    pages: [{ id: "match", mode: "match", rows: 2, columns: 2, cards }]
  });
  const grid = wrapper.getComponent(SetGrid);
  grid.vm.$emit("card", cards[0], 0);
  await flushPromises();
  audio.playCards.mockRejectedValueOnce(new Error("unavailable"));
  grid.vm.$emit("card", cards[3], 3);
  grid.vm.$emit("card", cards[3], 3);
  await flushPromises();
  expect(grid.props("selectedCardId")).toBe("top-a");
  expect(wrapper.getComponent(MatchOutputLine).props("errors")).toBe(1);
  expect(wrapper.getComponent(MatchOutputLine).props("message")).toContain("Озвучка недоступна");
  expect(grid.props("interactionBlocked")).toBe(false);
  grid.vm.$emit("card", cards[2], 2);
  await flushPromises();
  expect(wrapper.getComponent(MatchOutputLine).props("solvedPairs")).toBe(1);
  expect(wrapper.getComponent(MatchOutputLine).props("totalPairs")).toBe(2);
  expect(wrapper.getComponent(MatchOutputLine).props("errors")).toBe(1);
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

it("does not allow manual next before feedback or repeated next to skip an unanswered question", async () => {
  const { wrapper, store } = await mountQuiz();
  let complete!: () => void;
  audio.forcePlayText.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      })
  );
  wrapper.getComponent(SetGrid).vm.$emit("card", right, 1);
  wrapper.getComponent(QuizOutputLine).vm.$emit("next");
  await flushPromises();
  expect(store.state.explorer.page).toBe(0);
  complete();
  await flushPromises();
  wrapper.getComponent(QuizOutputLine).vm.$emit("next");
  wrapper.getComponent(QuizOutputLine).vm.$emit("next");
  await flushPromises();
  expect(store.state.explorer.page).toBe(1);
  expect(wrapper.getComponent(QuizOutputLine).props("page")).toBe(1);
  wrapper.unmount();
});
