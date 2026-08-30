import { v4 as uuid } from "uuid";
import {
  Card,
  CardType,
  cloneCard,
  clonePage,
  createPlaceholderCard,
  getCardGridPlacements,
  getMatchLane,
  normalizePage,
  PageMode,
  SetPage
} from "@/common/interfaces/ConfigFile";

export interface EditorCardsResult {
  cards: Card[];
  selectedCardId: string | null;
}

export interface CardAudio {
  audioPath: string;
  audioText?: string;
  audioVoice?: string;
}

export interface EditorPagesResult {
  pages: SetPage[];
  page: number;
}

export interface MatchLinkResult {
  cards: Card[];
  pendingMatchCardId: string | null;
}

export interface CardSpanInfo {
  canFillRow: boolean;
  canGrowDown: boolean;
  canGrowRight: boolean;
  canReset: boolean;
  currentHeight: number;
  currentWidth: number;
  fillRowWidth: number;
  maxHeight: number;
  maxWidth: number;
  mergeable: boolean;
}

export function isValidEditorCard(card: Card): boolean {
  if (card.cardType === CardType.AudioCard) {
    return !!card.imagePath && !!card.title;
  }
  return true;
}

export function isValidMatchCard(
  card: Card,
  cards: Card[],
  topColumns: number,
  bottomColumns = topColumns
): boolean {
  if (card.cardType !== CardType.AudioCard) return true;
  const index = cards.findIndex((item) => item.id === card.id);
  if (index === -1 || index >= topColumns + bottomColumns || !card.matchId) return false;

  const matches = cards.filter(
    (item) => item.cardType === CardType.AudioCard && item.matchId === card.matchId
  );
  return matches.some(
    (item) =>
      item.id !== card.id &&
      getMatchLane(
        cards.findIndex((cardItem) => cardItem.id === item.id),
        topColumns
      ) !== getMatchLane(index, topColumns)
  );
}

export function isValidMatchPage(
  cards: Card[],
  topColumns: number,
  bottomColumns = topColumns
): boolean {
  if (cards.length > topColumns + bottomColumns) return false;
  return cards.every(
    (card) => isValidEditorCard(card) && isValidMatchCard(card, cards, topColumns, bottomColumns)
  );
}

export function createEditorPage(
  mode: PageMode = "standard",
  pageColumns = 3,
  pageRows = 3,
  topColumns?: number,
  bottomColumns?: number
): SetPage {
  return normalizePage({
    mode,
    columns: pageColumns,
    rows: mode === "match" ? 2 : pageRows,
    topColumns,
    bottomColumns,
    cards: [createPlaceholderCard()]
  });
}

export function clearCardAudio(card: Card): Card {
  const next = cloneCard(card);
  delete next.audioPath;
  delete next.audioText;
  delete next.audioVoice;
  return next;
}

export function copyCardAudio(card: Card): CardAudio | null {
  if (!card.audioPath) return null;
  return {
    audioPath: card.audioPath,
    audioText: card.audioText,
    audioVoice: card.audioVoice
  };
}

export function applyCardAudio(card: Card, audio: CardAudio): Card {
  const next = clearCardAudio(card);
  next.audioPath = audio.audioPath;
  if (audio.audioText !== undefined) next.audioText = audio.audioText;
  if (audio.audioVoice !== undefined) next.audioVoice = audio.audioVoice;
  return next;
}

export function copySelectedCard(cards: Card[], selectedCardId: string | null): EditorCardsResult {
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

export function resetSelectedCard(cards: Card[], selectedCardId: string | null): EditorCardsResult {
  const selectedIndex = cards.findIndex((card) => card.id === selectedCardId);
  if (selectedIndex === -1) return { cards, selectedCardId };

  const nextCards = cards.map((card) => cloneCard(card));
  nextCards[selectedIndex] = createPlaceholderCard();

  return {
    cards: nextCards,
    selectedCardId: nextCards[selectedIndex].id
  };
}

export function isCardMerged(card: Card | null | undefined): boolean {
  return !!card && ((card.width ?? 1) > 1 || (card.height ?? 1) > 1);
}

export function getSelectedCardSpanInfo(
  cards: Card[],
  selectedCardId: string | null,
  columns: number,
  rows: number,
  mode: PageMode
): CardSpanInfo {
  const fallback = createCardSpanInfo(false);
  const selectedIndex = cards.findIndex((card) => card.id === selectedCardId);
  if (selectedIndex === -1 || mode === "match") return fallback;

  const selected = cards[selectedIndex];
  if (!isMergeableCardType(selected.cardType)) return fallback;

  const placements = getCardGridPlacements({ columns, rows, cards });
  const placement = placements[selectedIndex];
  if (!placement || placement.covered) return fallback;

  const maxWidth = getMaxAvailableWidth(
    cards,
    placements,
    selectedIndex,
    columns,
    rows,
    placement.width,
    placement.height
  );
  const maxHeight = getMaxAvailableHeight(
    cards,
    placements,
    selectedIndex,
    columns,
    rows,
    placement.width,
    placement.height
  );

  return {
    canFillRow: maxWidth > placement.width,
    canGrowDown: maxHeight > placement.height,
    canGrowRight: maxWidth > placement.width,
    canReset: placement.width > 1 || placement.height > 1,
    currentHeight: placement.height,
    currentWidth: placement.width,
    fillRowWidth: maxWidth,
    maxHeight,
    maxWidth,
    mergeable: true
  };
}

export function canMergeSelectedCard(
  cards: Card[],
  selectedCardId: string | null,
  columns: number,
  rows: number,
  mode: PageMode
): boolean {
  const info = getSelectedCardSpanInfo(cards, selectedCardId, columns, rows, mode);
  return info.canReset || info.canGrowRight || info.canGrowDown;
}

export function toggleSelectedCardMerge(
  cards: Card[],
  selectedCardId: string | null,
  columns: number,
  rows: number,
  mode: PageMode
): EditorCardsResult {
  const info = getSelectedCardSpanInfo(cards, selectedCardId, columns, rows, mode);
  if (info.canReset) return resetSelectedCardSpan(cards, selectedCardId);
  if (info.canGrowRight) return growSelectedCardRight(cards, selectedCardId, columns, rows, mode);
  return growSelectedCardDown(cards, selectedCardId, columns, rows, mode);
}

export function growSelectedCardRight(
  cards: Card[],
  selectedCardId: string | null,
  columns: number,
  rows: number,
  mode: PageMode
): EditorCardsResult {
  const info = getSelectedCardSpanInfo(cards, selectedCardId, columns, rows, mode);
  if (!info.canGrowRight) return { cards, selectedCardId };
  return resizeSelectedCard(cards, selectedCardId, info.currentWidth + 1, info.currentHeight);
}

export function growSelectedCardDown(
  cards: Card[],
  selectedCardId: string | null,
  columns: number,
  rows: number,
  mode: PageMode
): EditorCardsResult {
  const info = getSelectedCardSpanInfo(cards, selectedCardId, columns, rows, mode);
  if (!info.canGrowDown) return { cards, selectedCardId };
  return resizeSelectedCard(cards, selectedCardId, info.currentWidth, info.currentHeight + 1);
}

export function mergeSelectedCardFullRow(
  cards: Card[],
  selectedCardId: string | null,
  columns: number,
  rows: number,
  mode: PageMode
): EditorCardsResult {
  const info = getSelectedCardSpanInfo(cards, selectedCardId, columns, rows, mode);
  if (!info.canFillRow) return { cards, selectedCardId };
  return resizeSelectedCard(cards, selectedCardId, info.fillRowWidth, info.currentHeight);
}

export function resetSelectedCardSpan(
  cards: Card[],
  selectedCardId: string | null
): EditorCardsResult {
  return resizeSelectedCard(cards, selectedCardId, 1, 1);
}

export function advanceEditorPage(pages: SetPage[], page: number): EditorPagesResult {
  if (page < pages.length - 1) {
    return { pages, page: page + 1 };
  }

  const currentPage = pages[page] ?? createEditorPage();
  const nextPages = [
    ...pages,
    createEditorPage(
      currentPage.mode,
      currentPage.columns,
      currentPage.rows,
      currentPage.topColumns,
      currentPage.bottomColumns
    )
  ];
  return {
    pages: nextPages,
    page: nextPages.length - 1
  };
}

export function copyEditorPage(pages: SetPage[], page: number): EditorPagesResult {
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

export function deleteEditorPage(pages: SetPage[], page: number): EditorPagesResult {
  const pageIndex = clampPageIndex(page, pages.length);
  const currentPage = pages[pageIndex] ?? createEditorPage();
  const nextPages = [...pages];

  if (nextPages.length <= 1) {
    nextPages.splice(
      0,
      nextPages.length,
      createEditorPage(
        currentPage.mode,
        currentPage.columns,
        currentPage.rows,
        currentPage.topColumns,
        currentPage.bottomColumns
      )
    );
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

export function toggleMatchLink(
  cards: Card[],
  selectedCardId: string | null,
  pendingMatchCardId: string | null,
  columns: number
): MatchLinkResult {
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
  const existingMatchIds = [
    nextCards[selectedIndex].matchId,
    nextCards[pendingIndex].matchId
  ].filter((value): value is string => !!value);

  for (const card of nextCards) {
    if (existingMatchIds.includes(card.matchId ?? "")) card.matchId = matchId;
  }
  nextCards[selectedIndex].matchId = matchId;
  nextCards[pendingIndex].matchId = matchId;

  return {
    cards: nextCards,
    pendingMatchCardId: null
  };
}

export function clearMatchLink(cards: Card[], selectedCardId: string | null): MatchLinkResult {
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

function findLastPlaceholder(cards: Card[]): number {
  for (let index = cards.length - 1; index >= 0; index--) {
    if (cards[index].cardType === CardType.NewCard) {
      return index;
    }
  }
  return -1;
}

function isMergeableCardType(cardType: CardType): boolean {
  return cardType === CardType.AudioCard || cardType === CardType.SpaceCard;
}

function createCardSpanInfo(mergeable: boolean): CardSpanInfo {
  return {
    canFillRow: false,
    canGrowDown: false,
    canGrowRight: false,
    canReset: false,
    currentHeight: 1,
    currentWidth: 1,
    fillRowWidth: 1,
    maxHeight: 1,
    maxWidth: 1,
    mergeable
  };
}

function resizeSelectedCard(
  cards: Card[],
  selectedCardId: string | null,
  width: number,
  height: number
): EditorCardsResult {
  const selectedIndex = cards.findIndex((card) => card.id === selectedCardId);
  if (selectedIndex === -1) return { cards, selectedCardId };

  const nextCards = cards.map((card) => cloneCard(card));
  const nextSelected = nextCards[selectedIndex];
  if (width > 1) {
    nextSelected.width = width;
  } else {
    delete nextSelected.width;
  }
  if (height > 1) {
    nextSelected.height = height;
  } else {
    delete nextSelected.height;
  }

  return { cards: nextCards, selectedCardId };
}

function getMaxAvailableWidth(
  cards: Card[],
  placements: ReturnType<typeof getCardGridPlacements>,
  selectedIndex: number,
  columns: number,
  rows: number,
  currentWidth: number,
  currentHeight: number
): number {
  const column = selectedIndex % columns;
  let maxWidth = currentWidth;
  for (let width = currentWidth + 1; width <= columns - column; width++) {
    if (
      !isSpanAvailable(
        cards,
        placements,
        selectedIndex,
        columns,
        rows,
        width,
        currentHeight,
        currentWidth,
        currentHeight
      )
    )
      break;
    maxWidth = width;
  }
  return maxWidth;
}

function getMaxAvailableHeight(
  cards: Card[],
  placements: ReturnType<typeof getCardGridPlacements>,
  selectedIndex: number,
  columns: number,
  rows: number,
  currentWidth: number,
  currentHeight: number
): number {
  const row = Math.floor(selectedIndex / columns);
  let maxHeight = currentHeight;
  for (let height = currentHeight + 1; height <= rows - row; height++) {
    if (
      !isSpanAvailable(
        cards,
        placements,
        selectedIndex,
        columns,
        rows,
        currentWidth,
        height,
        currentWidth,
        currentHeight
      )
    )
      break;
    maxHeight = height;
  }
  return maxHeight;
}

function isSpanAvailable(
  cards: Card[],
  placements: ReturnType<typeof getCardGridPlacements>,
  selectedIndex: number,
  columns: number,
  rows: number,
  width: number,
  height: number,
  currentWidth: number,
  currentHeight: number
): boolean {
  const startRow = Math.floor(selectedIndex / columns);
  const startColumn = selectedIndex % columns;
  if (startColumn + width > columns || startRow + height > rows) return false;

  for (let y = startRow; y < startRow + height; y++) {
    for (let x = startColumn; x < startColumn + width; x++) {
      const index = y * columns + x;
      if (isInsideSelectedSpan(selectedIndex, index, columns, currentWidth, currentHeight))
        continue;
      if (!isMergeTargetAvailable(cards, placements, index)) return false;
    }
  }

  return true;
}

function isInsideSelectedSpan(
  selectedIndex: number,
  index: number,
  columns: number,
  width: number,
  height: number
): boolean {
  const startRow = Math.floor(selectedIndex / columns);
  const startColumn = selectedIndex % columns;
  const row = Math.floor(index / columns);
  const column = index % columns;
  return (
    row >= startRow &&
    row < startRow + height &&
    column >= startColumn &&
    column < startColumn + width
  );
}

function isMergeTargetAvailable(
  cards: Card[],
  placements: ReturnType<typeof getCardGridPlacements>,
  index: number
): boolean {
  const card = cards[index];
  const placement = placements[index];
  return (
    !!card && !placement?.covered && [CardType.NewCard, CardType.EmptyCard].includes(card.cardType)
  );
}

function clampPageIndex(page: number, length: number): number {
  if (!length) return 0;
  return Math.max(0, Math.min(length - 1, page ?? 0));
}
