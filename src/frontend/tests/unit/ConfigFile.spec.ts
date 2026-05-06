import chai from "chai";
import {
  CardType,
  CURRENT_SET_VERSION,
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
});
