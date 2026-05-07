import { v4 as uuid } from "uuid";
import {
  Card,
  CardType,
  cloneCard,
  clonePage,
  createPlaceholderCard,
  getMatchLane,
  normalizePage,
  PageMode,
  SetPage
} from "@/common/interfaces/ConfigFile";

export interface EditorCardsResult {
  cards: Card[];
  selectedCardId: string | null;
}

export interface EditorPagesResult {
  pages: SetPage[];
  page: number;
}

export interface MatchLinkResult {
  cards: Card[];
  pendingMatchCardId: string | null;
}

export function isValidEditorCard (card: Card): boolean {
  if (card.cardType === CardType.AudioCard) {
    return !!card.imagePath && !!card.title;
  }
  return true;
}

export function createEditorPage (mode: PageMode = "standard", pageColumns = 3, pageRows = 3): SetPage {
  return normalizePage({
    mode,
    columns: pageColumns,
    rows: mode === "match" ? 2 : pageRows,
    cards: [createPlaceholderCard()]
  });
}

export function copySelectedCard (cards: Card[], selectedCardId: string | null): EditorCardsResult {
  const selectedIndex = cards.findIndex((card) => card.id === selectedCardId);
  if (selectedIndex === -1) return { cards, selectedCardId };

  const placeholderIndex = cards.findIndex((card) => card.cardType === CardType.NewCard);
  if (placeholderIndex === -1) return { cards, selectedCardId };

  const copiedCard = cloneCard(cards[selectedIndex], true);
  const nextCards = cards.map((card) => cloneCard(card));
  nextCards.splice(selectedIndex + 1, 0, copiedCard);

  const removeIndex = findLastPlaceholder(nextCards);
  if (removeIndex !== -1) {
    nextCards.splice(removeIndex, 1);
  }

  return {
    cards: nextCards,
    selectedCardId: copiedCard.id
  };
}

export function resetSelectedCard (cards: Card[], selectedCardId: string | null): EditorCardsResult {
  const selectedIndex = cards.findIndex((card) => card.id === selectedCardId);
  if (selectedIndex === -1) return { cards, selectedCardId };

  const nextCards = cards.map((card) => cloneCard(card));
  nextCards[selectedIndex] = createPlaceholderCard();

  return {
    cards: nextCards,
    selectedCardId: nextCards[selectedIndex].id
  };
}

export function advanceEditorPage (pages: SetPage[], page: number): EditorPagesResult {
  if (page < pages.length - 1) {
    return { pages, page: page + 1 };
  }

  const currentPage = pages[page] ?? createEditorPage();
  const nextPages = [...pages, createEditorPage(currentPage.mode, currentPage.columns, currentPage.rows)];
  return {
    pages: nextPages,
    page: nextPages.length - 1
  };
}

export function copyEditorPage (pages: SetPage[], page: number): EditorPagesResult {
  const pageIndex = clampPageIndex(page, pages.length);
  const currentPage = pages[pageIndex] ?? createEditorPage();
  const nextPage = clonePage(currentPage, true);
  const nextPages = [...pages];

  nextPages.splice(pageIndex + 1, 0, nextPage);
  return {
    pages: nextPages,
    page: pageIndex + 1
  };
}

export function deleteEditorPage (pages: SetPage[], page: number): EditorPagesResult {
  const pageIndex = clampPageIndex(page, pages.length);
  const currentPage = pages[pageIndex] ?? createEditorPage();
  const nextPages = [...pages];

  if (nextPages.length <= 1) {
    nextPages.splice(0, nextPages.length, createEditorPage(currentPage.mode, currentPage.columns, currentPage.rows));
    return {
      pages: nextPages,
      page: 0
    };
  }

  nextPages.splice(pageIndex, 1);
  return {
    pages: nextPages,
    page: Math.max(0, Math.min(pageIndex, nextPages.length - 1))
  };
}

export function toggleMatchLink (cards: Card[], selectedCardId: string | null, pendingMatchCardId: string | null, columns: number): MatchLinkResult {
  const selectedIndex = cards.findIndex((card) => card.id === selectedCardId);
  if (selectedIndex === -1 || !selectedCardId) {
    return { cards, pendingMatchCardId };
  }
  if (pendingMatchCardId === selectedCardId) {
    return { cards, pendingMatchCardId: null };
  }
  if (!pendingMatchCardId) {
    return { cards, pendingMatchCardId: selectedCardId };
  }

  const pendingIndex = cards.findIndex((card) => card.id === pendingMatchCardId);
  if (pendingIndex === -1) {
    return { cards, pendingMatchCardId: selectedCardId };
  }

  const pendingLane = getMatchLane(pendingIndex, columns);
  const selectedLane = getMatchLane(selectedIndex, columns);
  if (pendingLane === selectedLane) {
    return { cards, pendingMatchCardId: selectedCardId };
  }

  const nextCards = cards.map((card) => cloneCard(card));
  const matchId = nextCards[selectedIndex].matchId ?? nextCards[pendingIndex].matchId ?? uuid();
  nextCards[selectedIndex].matchId = matchId;
  nextCards[pendingIndex].matchId = matchId;

  return {
    cards: nextCards,
    pendingMatchCardId: null
  };
}

export function clearMatchLink (cards: Card[], selectedCardId: string | null): MatchLinkResult {
  const selected = cards.find((card) => card.id === selectedCardId);
  if (!selected?.matchId) {
    return { cards, pendingMatchCardId: null };
  }

  const matchId = selected.matchId;
  const nextCards = cards.map((card) => {
    const nextCard = cloneCard(card);
    if (nextCard.matchId === matchId) {
      delete nextCard.matchId;
    }
    return nextCard;
  });

  return {
    cards: nextCards,
    pendingMatchCardId: null
  };
}

function findLastPlaceholder (cards: Card[]): number {
  for (let index = cards.length - 1; index >= 0; index--) {
    if (cards[index].cardType === CardType.NewCard) {
      return index;
    }
  }
  return -1;
}

function clampPageIndex (page: number, length: number): number {
  if (!length) return 0;
  return Math.max(0, Math.min(length - 1, page ?? 0));
}
