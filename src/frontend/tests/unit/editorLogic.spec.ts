import chai from "chai";
import { Card, CardType, normalizePage } from "@/common/interfaces/ConfigFile";
import {
  advanceEditorPage,
  applyCardAudio,
  canMergeSelectedCard,
  clearCardAudio,
  clearMatchLink,
  copyCardAudio,
  copyEditorPage,
  copySelectedCard,
  createEditorPage,
  getSelectedCardSpanInfo,
  growSelectedCardDown,
  growSelectedCardRight,
  isCardMerged,
  deleteEditorPage,
  isValidEditorCard,
  mergeSelectedCardFullRow,
  isValidMatchPage,
  resetSelectedCard,
  resetSelectedCardSpan,
  toggleMatchLink,
  toggleSelectedCardMerge
} from "@/frontend/utils/editorLogic";

const expect = chai.expect;

describe("editorLogic", () => {
  it("validates audio cards by image and title", () => {
    expect(
      isValidEditorCard({ id: "1", cardType: CardType.AudioCard }),
    ).to.equal(false);
    expect(
      isValidEditorCard({
        id: "2",
        cardType: CardType.AudioCard,
        imagePath: "image.png"
      }),
    ).to.equal(false);
    expect(
      isValidEditorCard({
        id: "3",
        cardType: CardType.AudioCard,
        imagePath: "image.png",
        title: "Hello"
      }),
    ).to.equal(true);
    expect(
      isValidEditorCard({ id: "4", cardType: CardType.SpaceCard }),
    ).to.equal(true);
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

  it("clears only audio data from a card", () => {
    const card: Card = {
      id: "audio-1",
      cardType: CardType.AudioCard,
      title: "one",
      imagePath: "one.png",
      audioPath: "voice.mp3",
      audioText: "hello",
      audioVoice: "alena"
    };

    const result = clearCardAudio(card);

    expect(result).to.not.equal(card);
    expect(result.audioPath).to.equal(undefined);
    expect(result.audioText).to.equal(undefined);
    expect(result.audioVoice).to.equal(undefined);
    expect(result.title).to.equal("one");
    expect(result.imagePath).to.equal("one.png");
    expect(card.audioPath).to.equal("voice.mp3");
  });

  it("copies all available audio data without changing the source card", () => {
    const source: Card = {
      id: "source",
      cardType: CardType.AudioCard,
      title: "Дом",
      audioPath: "voice.mp3",
      audioText: "дом",
      audioVoice: "alena"
    };

    const copied = copyCardAudio(source);

    expect(copied).to.deep.equal({
      audioPath: "voice.mp3",
      audioText: "дом",
      audioVoice: "alena"
    });
    expect(source).to.deep.equal({
      id: "source",
      cardType: CardType.AudioCard,
      title: "Дом",
      audioPath: "voice.mp3",
      audioText: "дом",
      audioVoice: "alena"
    });
  });

  it("does not copy a card without audio", () => {
    expect(
      copyCardAudio({ id: "empty", cardType: CardType.AudioCard }),
    ).to.equal(null);
  });

  it("applies copied audio and clears stale text-to-speech data", () => {
    const target: Card = {
      id: "target",
      cardType: CardType.AudioCard,
      title: "Кошка",
      imagePath: "cat.png",
      answer: true,
      audioPath: "old.mp3",
      audioText: "кошка",
      audioVoice: "john"
    };

    const result = applyCardAudio(target, { audioPath: "copied.wav" });

    expect(result).to.deep.include({
      id: "target",
      cardType: CardType.AudioCard,
      title: "Кошка",
      imagePath: "cat.png",
      answer: true,
      audioPath: "copied.wav"
    });
    expect(result.audioText).to.equal(undefined);
    expect(result.audioVoice).to.equal(undefined);
    expect(target.audioPath).to.equal("old.mp3");
    expect(target.audioText).to.equal("кошка");
    expect(target.audioVoice).to.equal("john");
  });

  it("copies selected card after itself and removes last placeholder", () => {
    const cards: Card[] = [
      {
        id: "audio-1",
        cardType: CardType.AudioCard,
        title: "one",
        imagePath: "one.png"
      },
      {
        id: "audio-2",
        cardType: CardType.AudioCard,
        title: "two",
        imagePath: "two.png"
      },
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
      {
        id: "audio-1",
        cardType: CardType.AudioCard,
        title: "one",
        imagePath: "one.png"
      }
    ];

    const result = copySelectedCard(cards, "audio-1");

    expect(result.cards).to.equal(cards);
    expect(result.selectedCardId).to.equal("audio-1");
  });

  it("resets selected card to a new placeholder", () => {
    const cards: Card[] = [
      {
        id: "audio-1",
        cardType: CardType.AudioCard,
        title: "one",
        imagePath: "one.png"
      }
    ];

    const result = resetSelectedCard(cards, "audio-1");

    expect(result.cards[0].cardType).to.equal(CardType.NewCard);
    expect(result.cards[0].id).to.not.equal("audio-1");
    expect(result.selectedCardId).to.equal(result.cards[0].id);
  });

  it("merges selected card into a free cell and then splits it", () => {
    const cards: Card[] = [
      {
        id: "audio-1",
        cardType: CardType.AudioCard,
        title: "one",
        imagePath: "one.png"
      },
      { id: "new", cardType: CardType.NewCard }
    ];

    const merged = toggleSelectedCardMerge(cards, "audio-1", 2, 1, "standard");
    const split = toggleSelectedCardMerge(
      merged.cards,
      "audio-1",
      2,
      1,
      "standard",
    );

    expect(canMergeSelectedCard(cards, "audio-1", 2, 1, "standard")).to.equal(
      true,
    );
    expect(merged.cards[0].width).to.equal(2);
    expect(isCardMerged(merged.cards[0])).to.equal(true);
    expect(split.cards[0].width).to.equal(undefined);
    expect(isCardMerged(split.cards[0])).to.equal(false);
  });

  it("does not merge into an occupied neighboring cell", () => {
    const cards: Card[] = [
      {
        id: "audio-1",
        cardType: CardType.AudioCard,
        title: "one",
        imagePath: "one.png"
      },
      {
        id: "audio-2",
        cardType: CardType.AudioCard,
        title: "two",
        imagePath: "two.png"
      }
    ];

    const result = toggleSelectedCardMerge(cards, "audio-1", 2, 1, "standard");

    expect(canMergeSelectedCard(cards, "audio-1", 2, 1, "standard")).to.equal(
      false,
    );
    expect(result.cards).to.equal(cards);
  });

  it("merges space cards into a free cell", () => {
    const cards: Card[] = [
      { id: "space", cardType: CardType.SpaceCard, title: " " },
      { id: "new", cardType: CardType.NewCard }
    ];

    const result = toggleSelectedCardMerge(cards, "space", 2, 1, "standard");

    expect(canMergeSelectedCard(cards, "space", 2, 1, "standard")).to.equal(
      true,
    );
    expect(result.cards[0].width).to.equal(2);
  });

  it("merges a space card to the end of the row", () => {
    const cards: Card[] = [
      { id: "space", cardType: CardType.SpaceCard, title: " " },
      { id: "new-1", cardType: CardType.NewCard },
      { id: "new-2", cardType: CardType.NewCard },
      { id: "new-3", cardType: CardType.NewCard }
    ];

    const info = getSelectedCardSpanInfo(cards, "space", 4, 1, "standard");
    const result = mergeSelectedCardFullRow(cards, "space", 4, 1, "standard");

    expect(info.canFillRow).to.equal(true);
    expect(info.fillRowWidth).to.equal(4);
    expect(result.cards[0].width).to.equal(4);
  });

  it("stops row merge before an occupied card", () => {
    const cards: Card[] = [
      { id: "space", cardType: CardType.SpaceCard, title: " " },
      { id: "new", cardType: CardType.NewCard },
      { id: "audio", cardType: CardType.AudioCard, title: "busy" },
      { id: "new-2", cardType: CardType.NewCard }
    ];

    const info = getSelectedCardSpanInfo(cards, "space", 4, 1, "standard");
    const result = mergeSelectedCardFullRow(cards, "space", 4, 1, "standard");

    expect(info.fillRowWidth).to.equal(2);
    expect(result.cards[0].width).to.equal(2);
  });

  it("grows cards right, down and resets spans", () => {
    const cards: Card[] = [
      { id: "audio", cardType: CardType.AudioCard },
      { id: "new-1", cardType: CardType.NewCard },
      { id: "new-2", cardType: CardType.NewCard },
      { id: "new-3", cardType: CardType.NewCard }
    ];

    const wide = growSelectedCardRight(cards, "audio", 2, 2, "standard");
    const tall = growSelectedCardDown(wide.cards, "audio", 2, 2, "standard");
    const reset = resetSelectedCardSpan(tall.cards, "audio");

    expect(wide.cards[0].width).to.equal(2);
    expect(tall.cards[0].height).to.equal(2);
    expect(reset.cards[0].width).to.equal(undefined);
    expect(reset.cards[0].height).to.equal(undefined);
  });

  it("does not merge cards on match pages", () => {
    const cards: Card[] = [
      { id: "audio-1", cardType: CardType.AudioCard },
      { id: "new", cardType: CardType.NewCard }
    ];

    expect(canMergeSelectedCard(cards, "audio-1", 2, 1, "match")).to.equal(
      false,
    );
  });

  it("advances within existing pages before creating a new page", () => {
    const pages = [
      createEditorPage("standard", 1, 1),
      createEditorPage("standard", 1, 1)
    ];

    const existing = advanceEditorPage(pages, 0);
    const appended = advanceEditorPage(pages, 1);

    expect(existing.pages).to.equal(pages);
    expect(existing.page).to.equal(1);
    expect(appended.pages).to.have.length(3);
    expect(appended.page).to.equal(2);
  });

  it("preserves unequal match row sizes when adding a page", () => {
    const page = createEditorPage("match", 3, 2, 1, 4);

    const result = advanceEditorPage([page], 0);

    expect(result.pages[1].topColumns).to.equal(1);
    expect(result.pages[1].bottomColumns).to.equal(4);
    expect(result.pages[1].cards).to.have.length(5);
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
    expect(
      result.pages[0].cards.every((card) => card.cardType === CardType.NewCard),
    ).to.equal(true);
  });

  it("preserves unequal match row sizes when resetting the only page", () => {
    const page = createEditorPage("match", 3, 2, 1, 4);

    const result = deleteEditorPage([page], 0);

    expect(result.pages[0].topColumns).to.equal(1);
    expect(result.pages[0].bottomColumns).to.equal(4);
    expect(result.pages[0].cards).to.have.length(5);
  });

  it("deletes selected page and clamps the next page index", () => {
    const pages = [
      createEditorPage("standard", 1, 1),
      createEditorPage("standard", 1, 1),
      createEditorPage("standard", 1, 1)
    ];

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
    const sameLane = toggleMatchLink(
      cards,
      "top-2",
      pending.pendingMatchCardId,
      2,
    );
    const linked = toggleMatchLink(
      cards,
      "bottom-1",
      pending.pendingMatchCardId,
      2,
    );

    expect(pending.pendingMatchCardId).to.equal("top-1");
    expect(sameLane.pendingMatchCardId).to.equal("top-2");
    expect(linked.pendingMatchCardId).to.equal(null);
    expect(linked.cards[0].matchId).to.equal(linked.cards[2].matchId);
    expect(linked.cards[0].matchId).to.be.a("string");
  });

  it("merges existing groups through repeated pairwise links", () => {
    const cards: Card[] = [
      {
        id: "top-1",
        cardType: CardType.AudioCard,
        title: "top 1",
        imagePath: "top-1.png",
        matchId: "group-1"
      },
      {
        id: "top-2",
        cardType: CardType.AudioCard,
        title: "top 2",
        imagePath: "top-2.png",
        matchId: "group-2"
      },
      {
        id: "bottom-1",
        cardType: CardType.AudioCard,
        title: "bottom 1",
        imagePath: "bottom-1.png",
        matchId: "group-1"
      },
      {
        id: "bottom-2",
        cardType: CardType.AudioCard,
        title: "bottom 2",
        imagePath: "bottom-2.png",
        matchId: "group-2"
      }
    ];

    const pending = toggleMatchLink(cards, "top-1", null, 2);
    const result = toggleMatchLink(
      cards,
      "bottom-2",
      pending.pendingMatchCardId,
      2,
    );

    expect(new Set(result.cards.map((card) => card.matchId)).size).to.equal(1);
    expect(isValidMatchPage(result.cards, 2, 2)).to.equal(true);
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
