import { v4 as uuid } from "uuid";

export enum CardType {
  AudioCard = 0,
  SpaceCard = 1,
  EmptyCard = 2,
  NewCard = 3
}

export type PageMode = "standard" | "quiz" | "match";

export interface Card {
  id: string;
  cardType: CardType;
  width?: number;
  height?: number;
  imagePath?: string;
  title?: string;
  audioPath?: string;
  audioText?: string;
  audioVoice?: string;
  answer?: true;
  matchId?: string;
  matchLane?: "top" | "bottom";
}

export interface SetPage {
  id: string;
  mode: PageMode;
  columns: number;
  rows: number;
  cards: Card[];
  topColumns?: number;
  bottomColumns?: number;
  question?: string;
}

export interface ConfigFile {
  version: string;
  columns?: number;
  rows?: number;
  withoutSpace: boolean;
  directSet?: boolean;
  quiz?: boolean;
  questions?: string[];
  quizAutoNext?: boolean;
  quizReadQuestion?: boolean;
  cards?: Card[];
  pages?: SetPage[];
  description?: string;
}

export interface CardGridPlacement {
  card: Card;
  index: number;
  row: number;
  column: number;
  width: number;
  height: number;
  covered: boolean;
}

export const CURRENT_SET_VERSION = "3.0";
export const DEFAULT_COLUMNS = 3;
export const DEFAULT_ROWS = 3;
export const DEFAULT_PAGE_MODE: PageMode = "standard";

export function isPageMode (value?: string): value is PageMode {
  return value === "standard" || value === "quiz" || value === "match";
}

export function clampPageDimension (value?: number, fallback = DEFAULT_COLUMNS): number {
  if (!value || Number.isNaN(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

export function clampCardSpan (value?: number, fallback = 1): number {
  if (!value || Number.isNaN(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

export function getMatchTopColumns (page: Partial<SetPage>, fallback?: Partial<SetPage>): number {
  const columns = clampPageDimension(page.columns, clampPageDimension(fallback?.columns, DEFAULT_COLUMNS));
  return clampPageDimension(page.topColumns, clampPageDimension(fallback?.topColumns, columns));
}

export function getMatchBottomColumns (page: Partial<SetPage>, fallback?: Partial<SetPage>): number {
  const columns = clampPageDimension(page.columns, clampPageDimension(fallback?.columns, DEFAULT_COLUMNS));
  return clampPageDimension(page.bottomColumns, clampPageDimension(fallback?.bottomColumns, columns));
}

export function getMatchCapacity (page: Partial<SetPage>, fallback?: Partial<SetPage>): number {
  return getMatchTopColumns(page, fallback) + getMatchBottomColumns(page, fallback);
}

export function getPageSize (page: Partial<SetPage>): number {
  if (page.mode === "match") return getMatchCapacity(page);
  return Math.max(1, clampPageDimension(page.rows, DEFAULT_ROWS) * clampPageDimension(page.columns, DEFAULT_COLUMNS));
}

export function getCardGridPlacements (page: Pick<SetPage, "rows" | "columns" | "cards">): CardGridPlacement[] {
  const columns = clampPageDimension(page.columns, DEFAULT_COLUMNS);
  const rows = clampPageDimension(page.rows, DEFAULT_ROWS);
  const occupied = new Set<number>();

  return page.cards.slice(0, rows * columns).map((card, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const covered = occupied.has(index);
    const width = Math.min(clampCardSpan(card.width), columns - column);
    const height = Math.min(clampCardSpan(card.height), rows - row);

    if (!covered) {
      for (let y = row; y < row + height; y++) {
        for (let x = column; x < column + width; x++) {
          const occupiedIndex = y * columns + x;
          if (occupiedIndex !== index) {
            occupied.add(occupiedIndex);
          }
        }
      }
    }

    return {
      card,
      index,
      row: row + 1,
      column: column + 1,
      width,
      height,
      covered
    };
  });
}

export function createPlaceholderCard (cardType = CardType.NewCard): Card {
  return {
    id: uuid(),
    cardType
  };
}

export function cloneCard (card: Card, renewId = false): Card {
  const copy = JSON.parse(JSON.stringify(card)) as Card;
  if (renewId || !copy.id) {
    copy.id = uuid();
  }
  return copy;
}

export function clonePage (page: SetPage, renewIds = false): SetPage {
  const copy = JSON.parse(JSON.stringify(page)) as SetPage;
  copy.id = renewIds || !copy.id ? uuid() : copy.id;
  copy.cards = (copy.cards ?? []).map((card) => cloneCard(card, renewIds));
  return normalizePage(copy);
}

export function getMatchLane (index: number, columns: number): "top" | "bottom" {
  return index < columns ? "top" : "bottom";
}

function normalizeCard (card: Card, mode: PageMode, columns: number, rows: number, topColumns: number, index: number): Card {
  const normalized = {
    ...card,
    id: card?.id ?? uuid(),
    cardType: card?.cardType ?? CardType.NewCard
  };
  if (mode === "standard" || mode === "quiz") {
    const width = Math.min(clampCardSpan(card?.width), columns);
    const height = Math.min(clampCardSpan(card?.height), rows);
    if (width > 1) {
      normalized.width = width;
    } else {
      delete normalized.width;
    }
    if (height > 1) {
      normalized.height = height;
    } else {
      delete normalized.height;
    }
  } else {
    delete normalized.width;
    delete normalized.height;
  }
  if (mode === "match") {
    normalized.matchLane = getMatchLane(index, topColumns);
  } else {
    delete normalized.matchLane;
    delete normalized.matchId;
  }
  if (mode !== "quiz") {
    delete normalized.answer;
  }
  return normalized;
}

export function normalizePage (page: Partial<SetPage>, fallback?: Partial<SetPage>): SetPage {
  const mode: PageMode = isPageMode(page.mode)
    ? page.mode
    : (isPageMode(fallback?.mode) ? fallback?.mode ?? DEFAULT_PAGE_MODE : DEFAULT_PAGE_MODE);
  const rowsFallback = mode === "match" ? 2 : DEFAULT_ROWS;
  const columns = clampPageDimension(page.columns, clampPageDimension(fallback?.columns, DEFAULT_COLUMNS));
  const rows = mode === "match"
    ? 2
    : clampPageDimension(page.rows, clampPageDimension(fallback?.rows, rowsFallback));
  const topColumns = mode === "match" ? getMatchTopColumns(page, fallback) : undefined;
  const bottomColumns = mode === "match" ? getMatchBottomColumns(page, fallback) : undefined;
  const size = mode === "match"
    ? (topColumns ?? DEFAULT_COLUMNS) + (bottomColumns ?? DEFAULT_COLUMNS)
    : Math.max(1, rows * columns);
  const sourceCards = (page.cards ?? []).filter(Boolean);
  const cards = (mode === "match" ? sourceCards : sourceCards.slice(0, size))
    .map((card, index) => normalizeCard(card, mode, columns, rows, topColumns ?? columns, index));

  while (cards.length < size) {
    cards.push(normalizeCard(createPlaceholderCard(CardType.NewCard), mode, columns, rows, topColumns ?? columns, cards.length));
  }

  return {
    id: page.id ?? fallback?.id ?? uuid(),
    mode,
    columns,
    rows,
    cards,
    topColumns,
    bottomColumns,
    question: mode === "quiz" ? page.question ?? fallback?.question ?? "" : undefined
  };
}

export function normalizeConfigFile (config: ConfigFile | null): ConfigFile | null {
  if (!config) return null;

  const baseColumns = clampPageDimension(config.columns, DEFAULT_COLUMNS);
  const baseRows = clampPageDimension(config.rows, DEFAULT_ROWS);
  const pages = config.pages?.length
    ? config.pages.map((page) => normalizePage(page, { columns: baseColumns, rows: baseRows }))
    : normalizeLegacyPages(config, baseColumns, baseRows);

  return {
    version: CURRENT_SET_VERSION,
    withoutSpace: !!config.withoutSpace,
    directSet: !!config.directSet,
    quizAutoNext: config.quizAutoNext ?? true,
    quizReadQuestion: config.quizReadQuestion ?? false,
    description: config.description,
    pages
  };
}

function normalizeLegacyPages (config: ConfigFile, columns: number, rows: number): SetPage[] {
  const cards = (config.cards ?? []).filter(Boolean).map((card) => cloneCard(card));
  const questions = config.questions ?? [];
  const pageSize = Math.max(1, columns * rows);
  const pageCount = Math.max(
    1,
    Math.ceil(cards.length / pageSize),
    config.quiz ? questions.length : 0
  );
  const mode: PageMode = config.quiz ? "quiz" : "standard";
  const pages: SetPage[] = [];

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    pages.push(normalizePage({
      id: uuid(),
      mode,
      columns,
      rows,
      cards: cards.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
      question: mode === "quiz" ? questions[pageIndex] ?? "" : undefined
    }));
  }

  return pages;
}
