import chai from "chai";
import {
  CardType,
  clonePage,
  CURRENT_SET_VERSION,
  DEFAULT_COLUMNS,
  DEFAULT_ROWS,
  getPageSize,
  normalizeConfigFile,
  normalizePage
} from "@/common/interfaces/ConfigFile";

const expect = chai.expect;

describe("config file normalization", () => {
  it("migrates legacy quiz config to page-based format", () => {
    const config = normalizeConfigFile({
      version: "2.0",
      columns: 2,
      rows: 2,
      withoutSpace: false,
      quiz: true,
      questions: ["Q1", "Q2"],
      cards: [
        { id: "1", cardType: CardType.AudioCard, title: "one" },
        { id: "2", cardType: CardType.AudioCard, title: "two" },
        { id: "3", cardType: CardType.AudioCard, title: "three" },
        { id: "4", cardType: CardType.AudioCard, title: "four" }
      ]
    });

    expect(config?.version).to.equal(CURRENT_SET_VERSION);
    expect(config?.pages).to.have.length(2);
    expect(config?.pages?.[0].mode).to.equal("quiz");
    expect(config?.pages?.[0].question).to.equal("Q1");
    expect(config?.pages?.[1].question).to.equal("Q2");
  });

  it("forces match pages to two rows and annotates lanes", () => {
    const page = normalizePage({
      mode: "match",
      columns: 3,
      rows: 4,
      cards: [
        { id: "1", cardType: CardType.AudioCard },
        { id: "2", cardType: CardType.AudioCard },
        { id: "3", cardType: CardType.AudioCard },
        { id: "4", cardType: CardType.AudioCard }
      ]
    });

    expect(page.rows).to.equal(2);
    expect(page.cards[0].matchLane).to.equal("top");
    expect(page.cards[3].matchLane).to.equal("bottom");
  });

  it("fills missing cards with placeholders up to page size", () => {
    const page = normalizePage({
      mode: "standard",
      columns: 2,
      rows: 2,
      cards: [{ id: "1", cardType: CardType.AudioCard, title: "one" }]
    });

    expect(page.cards).to.have.length(4);
    expect(page.cards[0].cardType).to.equal(CardType.AudioCard);
    expect(page.cards.slice(1).every((card) => card.cardType === CardType.NewCard)).to.equal(true);
  });

  it("trims extra cards beyond normalized page size", () => {
    const page = normalizePage({
      mode: "standard",
      columns: 2,
      rows: 1,
      cards: [
        { id: "1", cardType: CardType.AudioCard },
        { id: "2", cardType: CardType.AudioCard },
        { id: "3", cardType: CardType.AudioCard }
      ]
    });

    expect(page.cards.map((card) => card.id)).to.deep.equal(["1", "2"]);
  });

  it("sanitizes unsupported dimensions and mode", () => {
    const page = normalizePage({
      // @ts-expect-error testing runtime normalization of persisted invalid data
      mode: "broken",
      columns: 0,
      rows: Number.NaN,
      cards: []
    });

    expect(page.mode).to.equal("standard");
    expect(page.columns).to.equal(DEFAULT_COLUMNS);
    expect(page.rows).to.equal(DEFAULT_ROWS);
    expect(page.cards).to.have.length(DEFAULT_COLUMNS * DEFAULT_ROWS);
  });

  it("removes match and answer metadata outside their page modes", () => {
    const standard = normalizePage({
      mode: "standard",
      columns: 1,
      rows: 1,
      cards: [{ id: "1", cardType: CardType.AudioCard, answer: true, matchId: "m1", matchLane: "top" }]
    });
    const quiz = normalizePage({
      mode: "quiz",
      columns: 1,
      rows: 1,
      cards: [{ id: "2", cardType: CardType.AudioCard, answer: true, matchId: "m2", matchLane: "bottom" }]
    });

    expect(standard.cards[0].answer).to.equal(undefined);
    expect(standard.cards[0].matchId).to.equal(undefined);
    expect(standard.cards[0].matchLane).to.equal(undefined);
    expect(quiz.cards[0].answer).to.equal(true);
    expect(quiz.cards[0].matchId).to.equal(undefined);
    expect(quiz.cards[0].matchLane).to.equal(undefined);
  });

  it("splits legacy standard cards into normalized pages", () => {
    const config = normalizeConfigFile({
      version: "2.0",
      columns: 2,
      rows: 2,
      withoutSpace: true,
      cards: Array.from({ length: 5 }, (_, index) => ({
        id: String(index + 1),
        cardType: CardType.AudioCard,
        title: `card ${index + 1}`
      }))
    });

    expect(config?.version).to.equal(CURRENT_SET_VERSION);
    expect(config?.withoutSpace).to.equal(true);
    expect(config?.pages).to.have.length(2);
    expect(config?.pages?.[0].cards.map((card) => card.id)).to.deep.equal(["1", "2", "3", "4"]);
    expect(config?.pages?.[1].cards[0].id).to.equal("5");
    expect(config?.pages?.[1].cards.slice(1).every((card) => card.cardType === CardType.NewCard)).to.equal(true);
  });

  it("normalizes existing page-based config without legacy fields", () => {
    const config = normalizeConfigFile({
      version: "3.0",
      columns: 8,
      rows: 8,
      withoutSpace: false,
      directSet: true,
      quizAutoNext: false,
      quizReadQuestion: true,
      description: "hello",
      pages: [{
        id: "page-1",
        mode: "quiz",
        columns: 1,
        rows: 1,
        question: "Question?",
        cards: [{ id: "card-1", cardType: CardType.AudioCard, answer: true }]
      }]
    });

    expect(config).to.deep.include({
      version: CURRENT_SET_VERSION,
      withoutSpace: false,
      directSet: true,
      quizAutoNext: false,
      quizReadQuestion: true,
      description: "hello"
    });
    expect(config?.pages?.[0].question).to.equal("Question?");
    expect(config?.pages?.[0].cards[0].answer).to.equal(true);
    expect(config?.cards).to.equal(undefined);
    expect(config?.columns).to.equal(undefined);
    expect(config?.rows).to.equal(undefined);
  });

  it("renews page and card ids when cloning for editor copy", () => {
    const source = normalizePage({
      id: "page-1",
      mode: "standard",
      columns: 1,
      rows: 1,
      cards: [{ id: "card-1", cardType: CardType.AudioCard, title: "one" }]
    });

    const clone = clonePage(source, true);

    expect(clone.id).to.not.equal(source.id);
    expect(clone.cards[0].id).to.not.equal(source.cards[0].id);
    expect(clone.cards[0].title).to.equal("one");
    expect(getPageSize(clone)).to.equal(1);
  });
});
