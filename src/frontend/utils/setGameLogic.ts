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
  topColumns?: number;
  bottomColumns?: number;
  matchErrors: number;
  matchedCardIds: string[];
  page: number;
  selectedCardId: string | null;
  solvedPairIds?: string[];
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
  solvedPairIds: string[];
}

const DEFAULT_MATCH_MESSAGE = "Соотнесите каждый элемент верхней строки со всеми подходящими элементами нижней строки";

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

export function getTotalMatchPairs (cards: Card[], topColumns?: number, bottomColumns = topColumns): number {
  if (topColumns !== undefined && bottomColumns !== undefined && cards.length > topColumns + bottomColumns) return 0;
  const groups = getMatchGroups(cards);
  return [...groups.values()]
    .filter((group) => isValidMatchGroup(group, cards, topColumns))
    .reduce((total, group) => {
      if (topColumns === undefined) return total + 1;
      const top = group.filter((card) => getRow(card, cards, topColumns) === 0).length;
      const bottom = group.length - top;
      return total + top * bottom;
    }, 0);
}

export function getSolvedMatchPairs (matchedCardIds: string[]): number {
  return matchedCardIds.length / 2;
}

export function getSolvedMatchPairCount (solvedPairIds: string[]): number {
  return solvedPairIds.length;
}

export function getCompletedMatchCardIds (cards: Card[], topColumns: number, bottomColumns: number, solvedPairIds: string[]): string[] {
  if (cards.length > topColumns + bottomColumns) return [];
  const solved = new Set(solvedPairIds);
  const completed: string[] = [];

  for (const card of cards) {
    if (card.cardType !== CardType.AudioCard || !card.matchId) continue;
    const group = cards.filter((item) => item.cardType === CardType.AudioCard && item.matchId === card.matchId);
    const row = getRow(card, cards, topColumns);
    const opposite = group.filter((item) => getRow(item, cards, topColumns) !== row);
    if (opposite.length && opposite.every((item) => solved.has(getPairId(card.id, item.id)))) {
      completed.push(card.id);
    }
  }

  return completed;
}

export function isPlayableMatchPage (cards: Card[], topColumns: number, bottomColumns: number): boolean {
  if (cards.length > topColumns + bottomColumns) return false;
  return [...getMatchGroups(cards).values()].every((group) => isValidMatchGroup(group, cards, topColumns)) &&
    cards.every((card) => card.cardType !== CardType.AudioCard || (card.matchId && isValidMatchGroup(
      cards.filter((item) => item.cardType === CardType.AudioCard && item.matchId === card.matchId),
      cards,
      topColumns
    )));
}

export function handleMatchCard (card: Card, index: number, state: MatchState): MatchResult {
  const topColumns = state.topColumns ?? state.columns;
  const bottomColumns = state.bottomColumns ?? state.columns;
  const usingLegacyMatchedIds = state.solvedPairIds === undefined;
  const solvedPairIds = state.solvedPairIds ?? getLegacySolvedPairIds(state.cards, state.matchedCardIds);
  const matchedCardIds = usingLegacyMatchedIds
    ? state.matchedCardIds
    : getCompletedMatchCardIds(state.cards, topColumns, bottomColumns, solvedPairIds);

  if (card.cardType !== CardType.AudioCard || matchedCardIds.includes(card.id)) {
    return ignoredMatchResult(state, matchedCardIds, solvedPairIds);
  }

  const row = index < topColumns ? 0 : 1;
  const previous = state.cards.find((item) => item.id === state.selectedCardId);

  if (!state.selectedCardId) {
    return {
      advancePageAfterSolved: false,
      ignored: false,
      matchErrors: state.matchErrors,
      matchMessage: "Выберите карточку из другой строки",
      matchedCardIds,
      selectedCardId: card.id,
      shouldPlayCard: true,
      solvedPairIds
    };
  }

  if (state.selectedCardId === card.id) {
    return {
      advancePageAfterSolved: false,
      ignored: false,
      matchErrors: state.matchErrors,
      matchMessage: DEFAULT_MATCH_MESSAGE,
      matchedCardIds,
      selectedCardId: null,
      shouldPlayCard: true,
      solvedPairIds
    };
  }

  const previousIndex = state.cards.findIndex((item) => item.id === state.selectedCardId);
  const previousRow = previousIndex < topColumns ? 0 : 1;
  if (!previous || previousRow === row) {
    return {
      advancePageAfterSolved: false,
      ignored: false,
      matchErrors: state.matchErrors,
      matchMessage: "Выберите карточку из другой строки",
      matchedCardIds,
      selectedCardId: card.id,
      shouldPlayCard: true,
      solvedPairIds
    };
  }

  const matchGroup = state.cards.filter((item) => item.cardType === CardType.AudioCard && item.matchId === card.matchId);
  if (previous.matchId && card.matchId && previous.matchId === card.matchId && isValidMatchGroup(matchGroup, state.cards, topColumns)) {
    const pairId = getPairId(previous.id, card.id);
    if (solvedPairIds.includes(pairId)) {
      return {
        advancePageAfterSolved: false,
        ignored: true,
        matchErrors: state.matchErrors,
        matchMessage: DEFAULT_MATCH_MESSAGE,
        matchedCardIds,
        selectedCardId: null,
        shouldPlayCard: false,
        solvedPairIds
      };
    }

    const nextSolvedPairIds = [...solvedPairIds, pairId];
    const nextMatchedCardIds = usingLegacyMatchedIds
      ? [...new Set([...state.matchedCardIds, previous.id, card.id])]
      : getCompletedMatchCardIds(state.cards, topColumns, bottomColumns, nextSolvedPairIds);
    const totalPairs = getTotalMatchPairs(state.cards, topColumns, bottomColumns);
    const allPairsSolved = nextSolvedPairIds.length >= totalPairs;
    return {
      advancePageAfterSolved: allPairsSolved && state.page < state.totalPages - 1,
      feedbackText: "Правильно",
      ignored: false,
      matchErrors: state.matchErrors,
      matchMessage: allPairsSolved ? "Все связи найдены" : "Верно",
      matchedCardIds: nextMatchedCardIds,
      selectedCardId: null,
      shouldPlayCard: true,
      solvedPairIds: nextSolvedPairIds
    };
  }

  return {
    advancePageAfterSolved: false,
    feedbackText: "Неправильно",
    ignored: false,
    matchErrors: state.matchErrors + 1,
    matchMessage: "Неверная пара",
    matchedCardIds,
    selectedCardId: null,
    shouldPlayCard: true,
    solvedPairIds
  };
}

function getMatchGroups (cards: Card[]): Map<string, Card[]> {
  const groups = new Map<string, Card[]>();
  for (const card of cards) {
    if (card.cardType !== CardType.AudioCard || !card.matchId) continue;
    const group = groups.get(card.matchId) ?? [];
    group.push(card);
    groups.set(card.matchId, group);
  }
  return groups;
}

function isValidMatchGroup (group: Card[], cards: Card[], topColumns?: number): boolean {
  if (topColumns === undefined) return group.length === 2;
  if (!group.length) return false;
  const rows = group.map((card) => getRow(card, cards, topColumns));
  return rows.includes(0) && rows.includes(1);
}

function getRow (card: Card, cards: Card[], topColumns: number): 0 | 1 {
  return cards.findIndex((item) => item.id === card.id) < topColumns ? 0 : 1;
}

function getPairId (firstId: string, secondId: string): string {
  return [firstId, secondId].sort().join("::");
}

function getLegacySolvedPairIds (cards: Card[], matchedCardIds: string[]): string[] {
  const matched = new Set(matchedCardIds);
  return [...getMatchGroups(cards).values()]
    .filter((group) => group.length === 2 && group.every((card) => matched.has(card.id)))
    .map((group) => getPairId(group[0].id, group[1].id));
}

function ignoredMatchResult (state: MatchState, matchedCardIds: string[], solvedPairIds: string[]): MatchResult {
  return {
    advancePageAfterSolved: false,
    ignored: true,
    matchErrors: state.matchErrors,
    matchMessage: DEFAULT_MATCH_MESSAGE,
    matchedCardIds,
    selectedCardId: state.selectedCardId,
    shouldPlayCard: false,
    solvedPairIds
  };
}
