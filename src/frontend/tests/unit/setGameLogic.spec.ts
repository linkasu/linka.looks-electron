import chai from "chai";
import { Card, CardType } from "@/common/interfaces/ConfigFile";
import {
  advanceQuizPage,
  getSolvedMatchPairCount,
  getSolvedMatchPairs,
  getTotalMatchPairs,
  handleMatchCard,
  handleQuizCard,
  shouldAddCardToStandardOutput
} from "@/frontend/utils/setGameLogic";

const expect = chai.expect;

describe("setGameLogic", () => {
  it("decides which cards go to standard output", () => {
    expect(shouldAddCardToStandardOutput({ id: "audio", cardType: CardType.AudioCard }, false)).to.equal(true);
    expect(shouldAddCardToStandardOutput({ id: "space", cardType: CardType.SpaceCard }, false)).to.equal(false);
    expect(shouldAddCardToStandardOutput({ id: "space", cardType: CardType.SpaceCard }, true)).to.equal(true);
    expect(shouldAddCardToStandardOutput({ id: "empty", cardType: CardType.EmptyCard }, true)).to.equal(false);
  });

  it("advances quiz page or finishes quiz", () => {
    const next = advanceQuizPage({ errors: 0, page: 0, quizFinished: false, totalPages: 2, waitingForNext: true });
    const finished = advanceQuizPage({ errors: 0, page: 1, quizFinished: false, totalPages: 2, waitingForNext: true });

    expect(next.page).to.equal(1);
    expect(next.waitingForNext).to.equal(false);
    expect(next.quizFinished).to.equal(false);
    expect(finished.page).to.equal(1);
    expect(finished.waitingForNext).to.equal(false);
    expect(finished.quizFinished).to.equal(true);
  });

  it("handles correct quiz answer with auto next", () => {
    const result = handleQuizCard(
      { id: "answer", cardType: CardType.AudioCard, answer: true },
      { errors: 0, page: 0, quizFinished: false, totalPages: 2, waitingForNext: false },
      true
    );

    expect(result.ignored).to.equal(false);
    expect(result.feedbackText).to.equal("Правильный ответ");
    expect(result.page).to.equal(1);
    expect(result.waitingForNext).to.equal(false);
  });

  it("handles correct quiz answer with manual next", () => {
    const result = handleQuizCard(
      { id: "answer", cardType: CardType.AudioCard, answer: true },
      { errors: 0, page: 0, quizFinished: false, totalPages: 2, waitingForNext: false },
      false
    );

    expect(result.page).to.equal(0);
    expect(result.waitingForNext).to.equal(true);
    expect(result.feedbackText).to.equal("Правильный ответ");
  });

  it("handles wrong quiz answer and ignores clicks while waiting for next", () => {
    const wrong = handleQuizCard(
      { id: "wrong", cardType: CardType.AudioCard },
      { errors: 1, page: 0, quizFinished: false, totalPages: 2, waitingForNext: false },
      false
    );
    const ignored = handleQuizCard(
      { id: "answer", cardType: CardType.AudioCard, answer: true },
      { errors: 2, page: 0, quizFinished: false, totalPages: 2, waitingForNext: true },
      true
    );

    expect(wrong.errors).to.equal(2);
    expect(wrong.page).to.equal(0);
    expect(wrong.feedbackText).to.equal("Неправильный ответ");
    expect(ignored.ignored).to.equal(true);
    expect(ignored.errors).to.equal(2);
  });

  it("counts total and solved match pairs", () => {
    expect(getTotalMatchPairs([{ id: "card", cardType: CardType.AudioCard }])).to.equal(0);
    expect(getTotalMatchPairs([
      { id: "top-1", cardType: CardType.AudioCard, matchId: "m1" },
      { id: "bottom-1", cardType: CardType.AudioCard, matchId: "m1" },
      { id: "top-2", cardType: CardType.AudioCard, matchId: "m2" }
    ])).to.equal(1);
    expect(getSolvedMatchPairs(["top-1", "bottom-1"])).to.equal(1);
  });

  it("requires every cross-row pair in a many-to-many group", () => {
    const cards: Card[] = [
      { id: "top-1", cardType: CardType.AudioCard, matchId: "group" },
      { id: "top-2", cardType: CardType.AudioCard, matchId: "group" },
      { id: "bottom-1", cardType: CardType.AudioCard, matchId: "group" },
      { id: "bottom-2", cardType: CardType.AudioCard, matchId: "group" }
    ];
    let state = createMatchState(cards, { solvedPairIds: [] });

    expect(getTotalMatchPairs(cards, 2, 2)).to.equal(4);
    state = applyMatch(state, cards[0], 0);
    state = applyMatch(state, cards[2], 2);
    expect(state.matchedCardIds).to.deep.equal([]);
    expect(getSolvedMatchPairCount(state.solvedPairIds ?? [])).to.equal(1);

    const duplicate = handleMatchCard(cards[2], 2, { ...state, selectedCardId: cards[0].id });
    expect(duplicate.ignored).to.equal(true);

    state = applyMatch(state, cards[0], 0);
    state = applyMatch(state, cards[3], 3);
    state = applyMatch(state, cards[1], 1);
    state = applyMatch(state, cards[2], 2);
    state = applyMatch(state, cards[1], 1);
    state = applyMatch(state, cards[3], 3);
    expect(state.matchedCardIds).to.have.length(4);
    expect(state.solvedPairIds).to.have.length(4);
  });

  it("handles first match selection and repeated click", () => {
    const cards = createMatchCards();
    const first = handleMatchCard(cards[0], 0, createMatchState(cards));
    const repeated = handleMatchCard(cards[0], 0, createMatchState(cards, { selectedCardId: "top-1" }));

    expect(first.shouldPlayCard).to.equal(true);
    expect(first.selectedCardId).to.equal("top-1");
    expect(first.matchMessage).to.equal("Выберите карточку из другой строки");
    expect(repeated.selectedCardId).to.equal(null);
    expect(repeated.matchMessage).to.equal("Соотнесите каждый элемент верхней строки со всеми подходящими элементами нижней строки");
  });

  it("switches selection when the second card is in the same row", () => {
    const cards = createMatchCards();
    const result = handleMatchCard(cards[1], 1, createMatchState(cards, { selectedCardId: "top-1" }));

    expect(result.selectedCardId).to.equal("top-2");
    expect(result.matchErrors).to.equal(0);
    expect(result.feedbackText).to.equal(undefined);
  });

  it("marks correct match pair and requests page advance when all pairs are solved", () => {
    const cards = createMatchCards();
    const result = handleMatchCard(cards[2], 2, createMatchState(cards, {
      matchedCardIds: ["top-2", "bottom-2"],
      selectedCardId: "top-1"
    }));

    expect(result.feedbackText).to.equal("Правильно");
    expect(result.matchMessage).to.equal("Все связи найдены");
    expect(result.matchedCardIds).to.deep.equal(["top-2", "bottom-2", "top-1", "bottom-1"]);
    expect(result.selectedCardId).to.equal(null);
    expect(result.advancePageAfterSolved).to.equal(true);
  });

  it("handles wrong match pair", () => {
    const cards = createMatchCards();
    const result = handleMatchCard(cards[3], 3, createMatchState(cards, { selectedCardId: "top-1" }));

    expect(result.feedbackText).to.equal("Неправильно");
    expect(result.matchErrors).to.equal(1);
    expect(result.matchMessage).to.equal("Неверная пара");
    expect(result.selectedCardId).to.equal(null);
  });

  it("ignores disabled match cards", () => {
    const cards = createMatchCards();
    const empty = handleMatchCard({ id: "empty", cardType: CardType.EmptyCard }, 0, createMatchState(cards));
    const matched = handleMatchCard(cards[0], 0, createMatchState(cards, { matchedCardIds: ["top-1"] }));

    expect(empty.ignored).to.equal(true);
    expect(empty.shouldPlayCard).to.equal(false);
    expect(matched.ignored).to.equal(true);
    expect(matched.shouldPlayCard).to.equal(false);
  });
});

function createMatchCards (): Card[] {
  return [
    { id: "top-1", cardType: CardType.AudioCard, matchId: "m1" },
    { id: "top-2", cardType: CardType.AudioCard, matchId: "m2" },
    { id: "bottom-1", cardType: CardType.AudioCard, matchId: "m1" },
    { id: "bottom-2", cardType: CardType.AudioCard, matchId: "m2" }
  ];
}

function createMatchState (cards: Card[], overrides: Partial<Parameters<typeof handleMatchCard>[2]> = {}): Parameters<typeof handleMatchCard>[2] {
  return {
    cards,
    columns: 2,
    matchErrors: 0,
    matchedCardIds: [],
    page: 0,
    selectedCardId: null,
    totalPages: 2,
    ...overrides
  };
}

function applyMatch (state: Parameters<typeof handleMatchCard>[2], card: Card, index: number) {
  const result = handleMatchCard(card, index, state);
  return {
    ...state,
    matchedCardIds: result.matchedCardIds,
    selectedCardId: result.selectedCardId,
    solvedPairIds: result.solvedPairIds
  };
}
