import chai from "chai";
import { Card, CardType, normalizePage } from "@/common/interfaces/ConfigFile";
import {
  advanceEditorPage,
  clearMatchLink,
  copyEditorPage,
  copySelectedCard,
  createEditorPage,
  deleteEditorPage,
  isValidEditorCard,
  resetSelectedCard,
  toggleMatchLink
} from "@/frontend/utils/editorLogic";

const expect = chai.expect;

describe("editorLogic", () => {
  it("validates audio cards by image and title", () => {
    expect(isValidEditorCard({ id: "1", cardType: CardType.AudioCard })).to.equal(false);
    expect(isValidEditorCard({ id: "2", cardType: CardType.AudioCard, imagePath: "image.png" })).to.equal(false);
    expect(isValidEditorCard({ id: "3", cardType: CardType.AudioCard, imagePath: "image.png", title: "Hello" })).to.equal(true);
    expect(isValidEditorCard({ id: "4", cardType: CardType.SpaceCard })).to.equal(true);
  });

  it("creates normalized editor pages and forces match pages to two rows", () => {
    const standard = createEditorPage("standard", 2, 4);
    const match = createEditorPage("match", 3, 5);

    expect(standard.columns).to.equal(2);
    expect(standard.rows).to.equal(4);
    expect(standard.cards).to.have.length(8);
    expect(match.columns).to.equal(3);
    expect(match.rows).to.equal(2);
    expect(match.cards).to.have.length(6);
  });

  it("copies selected card after itself and removes last placeholder", () => {
    const cards: Card[] = [
      { id: "audio-1", cardType: CardType.AudioCard, title: "one", imagePath: "one.png" },
      { id: "audio-2", cardType: CardType.AudioCard, title: "two", imagePath: "two.png" },
      { id: "new", cardType: CardType.NewCard }
    ];

    const result = copySelectedCard(cards, "audio-1");

    expect(result.cards).to.have.length(3);
    expect(result.cards[1].title).to.equal("one");
    expect(result.cards[1].id).to.not.equal("audio-1");
    expect(result.selectedCardId).to.equal(result.cards[1].id);
    expect(result.cards.some((card) => card.id === "new")).to.equal(false);
  });

  it("does not copy when there is no placeholder", () => {
    const cards: Card[] = [
      { id: "audio-1", cardType: CardType.AudioCard, title: "one", imagePath: "one.png" }
    ];

    const result = copySelectedCard(cards, "audio-1");

    expect(result.cards).to.equal(cards);
    expect(result.selectedCardId).to.equal("audio-1");
  });

  it("resets selected card to a new placeholder", () => {
    const cards: Card[] = [
      { id: "audio-1", cardType: CardType.AudioCard, title: "one", imagePath: "one.png" }
    ];

    const result = resetSelectedCard(cards, "audio-1");

    expect(result.cards[0].cardType).to.equal(CardType.NewCard);
    expect(result.cards[0].id).to.not.equal("audio-1");
    expect(result.selectedCardId).to.equal(result.cards[0].id);
  });

  it("advances within existing pages before creating a new page", () => {
    const pages = [createEditorPage("standard", 1, 1), createEditorPage("standard", 1, 1)];

    const existing = advanceEditorPage(pages, 0);
    const appended = advanceEditorPage(pages, 1);

    expect(existing.pages).to.equal(pages);
    expect(existing.page).to.equal(1);
    expect(appended.pages).to.have.length(3);
    expect(appended.page).to.equal(2);
  });

  it("copies editor page with renewed ids", () => {
    const page = normalizePage({
      id: "page-1",
      mode: "standard",
      columns: 1,
      rows: 1,
      cards: [{ id: "card-1", cardType: CardType.AudioCard, title: "one" }]
    });

    const result = copyEditorPage([page], 0);

    expect(result.pages).to.have.length(2);
    expect(result.page).to.equal(1);
    expect(result.pages[1].id).to.not.equal("page-1");
    expect(result.pages[1].cards[0].id).to.not.equal("card-1");
    expect(result.pages[1].cards[0].title).to.equal("one");
  });

  it("resets the only page instead of deleting it", () => {
    const page = normalizePage({
      id: "page-1",
      mode: "match",
      columns: 2,
      rows: 2,
      cards: [{ id: "card-1", cardType: CardType.AudioCard, title: "one" }]
    });

    const result = deleteEditorPage([page], 0);

    expect(result.pages).to.have.length(1);
    expect(result.page).to.equal(0);
    expect(result.pages[0].mode).to.equal("match");
    expect(result.pages[0].columns).to.equal(2);
    expect(result.pages[0].rows).to.equal(2);
    expect(result.pages[0].cards.every((card) => card.cardType === CardType.NewCard)).to.equal(true);
  });

  it("deletes selected page and clamps the next page index", () => {
    const pages = [createEditorPage("standard", 1, 1), createEditorPage("standard", 1, 1), createEditorPage("standard", 1, 1)];

    const result = deleteEditorPage(pages, 2);

    expect(result.pages).to.have.length(2);
    expect(result.page).to.equal(1);
  });

  it("links match cards only across lanes", () => {
    const cards: Card[] = [
      { id: "top-1", cardType: CardType.AudioCard },
      { id: "top-2", cardType: CardType.AudioCard },
      { id: "bottom-1", cardType: CardType.AudioCard },
      { id: "bottom-2", cardType: CardType.AudioCard }
    ];

    const pending = toggleMatchLink(cards, "top-1", null, 2);
    const sameLane = toggleMatchLink(cards, "top-2", pending.pendingMatchCardId, 2);
    const linked = toggleMatchLink(cards, "bottom-1", pending.pendingMatchCardId, 2);

    expect(pending.pendingMatchCardId).to.equal("top-1");
    expect(sameLane.pendingMatchCardId).to.equal("top-2");
    expect(linked.pendingMatchCardId).to.equal(null);
    expect(linked.cards[0].matchId).to.equal(linked.cards[2].matchId);
    expect(linked.cards[0].matchId).to.be.a("string");
  });

  it("clears match link from all linked cards", () => {
    const cards: Card[] = [
      { id: "top", cardType: CardType.AudioCard, matchId: "match-1" },
      { id: "bottom", cardType: CardType.AudioCard, matchId: "match-1" },
      { id: "other", cardType: CardType.AudioCard, matchId: "match-2" }
    ];

    const result = clearMatchLink(cards, "top");

    expect(result.pendingMatchCardId).to.equal(null);
    expect(result.cards[0].matchId).to.equal(undefined);
    expect(result.cards[1].matchId).to.equal(undefined);
    expect(result.cards[2].matchId).to.equal("match-2");
  });
});
