import { Card, CardType } from "@/common/interfaces/ConfigFile";

export interface QuizState {
  errors: number;
  page: number;
  quizFinished: boolean;
  totalPages: number;
  waitingForNext: boolean;
}

export interface QuizResult extends QuizState {
  feedbackText?: string;
  ignored: boolean;
}

export interface MatchState {
  cards: Card[];
  columns: number;
  matchErrors: number;
  matchedCardIds: string[];
  page: number;
  selectedCardId: string | null;
  totalPages: number;
}

export interface MatchResult {
  advancePageAfterSolved: boolean;
  feedbackText?: string;
  ignored: boolean;
  matchErrors: number;
  matchMessage: string;
  matchedCardIds: string[];
  selectedCardId: string | null;
  shouldPlayCard: boolean;
}

const DEFAULT_MATCH_MESSAGE = "Соотнесите элементы из верхней и нижней строки";

export function shouldAddCardToStandardOutput (card: Card, withoutSpace?: boolean): boolean {
  return (
    (!!withoutSpace && [CardType.AudioCard, CardType.SpaceCard].includes(card.cardType)) ||
    (!withoutSpace && card.cardType === CardType.AudioCard)
  );
}

export function advanceQuizPage (state: QuizState): QuizState {
  if (state.page < state.totalPages - 1) {
    return {
      ...state,
      page: state.page + 1,
      waitingForNext: false
    };
  }

  return {
    ...state,
    quizFinished: true,
    waitingForNext: false
  };
}

export function handleQuizCard (card: Card, state: QuizState, quizAutoNext?: boolean): QuizResult {
  if (state.waitingForNext) {
    return {
      ...state,
      ignored: true
    };
  }

  if (card.answer) {
    const next = quizAutoNext ? advanceQuizPage(state) : { ...state, waitingForNext: true };
    return {
      ...next,
      feedbackText: "Правильный ответ",
      ignored: false
    };
  }

  const next = {
    ...state,
    errors: state.errors + 1
  };
  return {
    ...(quizAutoNext ? advanceQuizPage(next) : next),
    feedbackText: "Неправильный ответ",
    ignored: false
  };
}

export function getTotalMatchPairs (cards: Card[], columns?: number): number {
  const groups = new Map<string, Card[]>();
  for (const card of cards) {
    if (card.cardType !== CardType.AudioCard || !card.matchId) continue;
    const group = groups.get(card.matchId) ?? [];
    group.push(card);
    groups.set(card.matchId, group);
  }

  return [...groups.values()].filter((group) => isValidMatchGroup(group, cards, columns)).length;
}

function isValidMatchGroup (group: Card[], cards: Card[], columns?: number): boolean {
  if (group.length !== 2) return false;
  if (columns === undefined) return true;
  const rows = group.map((card) => {
    const index = cards.findIndex((item) => item.id === card.id);
    return index < columns ? "top" : "bottom";
  });
  return new Set(rows).size === 2;
}

export function getSolvedMatchPairs (matchedCardIds: string[]): number {
  return matchedCardIds.length / 2;
}

export function handleMatchCard (card: Card, index: number, state: MatchState): MatchResult {
  if (card.cardType !== CardType.AudioCard || state.matchedCardIds.includes(card.id)) {
    return {
      advancePageAfterSolved: false,
      ignored: true,
      matchErrors: state.matchErrors,
      matchMessage: DEFAULT_MATCH_MESSAGE,
      matchedCardIds: state.matchedCardIds,
      selectedCardId: state.selectedCardId,
      shouldPlayCard: false
    };
  }

  const row = index < state.columns ? 0 : 1;
  const previous = state.cards.find((item) => item.id === state.selectedCardId);

  if (!state.selectedCardId) {
    return {
      advancePageAfterSolved: false,
      ignored: false,
      matchErrors: state.matchErrors,
      matchMessage: "Выберите карточку из другой строки",
      matchedCardIds: state.matchedCardIds,
      selectedCardId: card.id,
      shouldPlayCard: true
    };
  }

  if (state.selectedCardId === card.id) {
    return {
      advancePageAfterSolved: false,
      ignored: false,
      matchErrors: state.matchErrors,
      matchMessage: DEFAULT_MATCH_MESSAGE,
      matchedCardIds: state.matchedCardIds,
      selectedCardId: null,
      shouldPlayCard: true
    };
  }

  const previousIndex = state.cards.findIndex((item) => item.id === state.selectedCardId);
  const previousRow = previousIndex < state.columns ? 0 : 1;
  if (!previous || previousRow === row) {
    return {
      advancePageAfterSolved: false,
      ignored: false,
      matchErrors: state.matchErrors,
      matchMessage: "Выберите карточку из другой строки",
      matchedCardIds: state.matchedCardIds,
      selectedCardId: card.id,
      shouldPlayCard: true
    };
  }

  const matchGroup = state.cards.filter((item) => item.cardType === CardType.AudioCard && item.matchId === card.matchId);
  if (previous.matchId && card.matchId && previous.matchId === card.matchId && isValidMatchGroup(matchGroup, state.cards, state.columns)) {
    const matchedCardIds = [...new Set([...state.matchedCardIds, previous.id, card.id])];
    const solvedPairs = getSolvedMatchPairs(matchedCardIds);
    const allPairsSolved = solvedPairs >= getTotalMatchPairs(state.cards, state.columns);
    return {
      advancePageAfterSolved: allPairsSolved && state.page < state.totalPages - 1,
      feedbackText: "Правильно",
      ignored: false,
      matchErrors: state.matchErrors,
      matchMessage: allPairsSolved ? "Все пары найдены" : "Верно",
      matchedCardIds,
      selectedCardId: null,
      shouldPlayCard: true
    };
  }

  return {
    advancePageAfterSolved: false,
    feedbackText: "Неправильно",
    ignored: false,
    matchErrors: state.matchErrors + 1,
    matchMessage: "Неверная пара",
    matchedCardIds: state.matchedCardIds,
    selectedCardId: null,
    shouldPlayCard: true
  };
}
