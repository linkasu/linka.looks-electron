import chai from "chai";
import { mount } from "@vue/test-utils";
import { createStore } from "vuex";
import SetGrid from "@/frontend/components/SetGrid.vue";
import { CardType, type ConfigFile } from "@/common/interfaces/ConfigFile";
import { PageWatcher } from "@linkasu/tobii-electron/renderer";

const expect = chai.expect;

vi.mock("@linkasu/tobii-electron/renderer", () => ({
  PageWatcher: {
    instance: {
      watchElementsChange: vi.fn()
    }
  }
}));

describe("SetGrid", () => {
  beforeEach(() => {
    (PageWatcher.instance?.watchElementsChange as unknown as ReturnType<typeof vi.fn>).mockClear();
  });

  it("renders cards from the selected page", () => {
    const wrapper = mountSetGrid({
      config: createConfig([
        {
          id: "page-1",
          mode: "standard",
          columns: 1,
          rows: 1,
          cards: [{ id: "first", cardType: CardType.AudioCard, title: "first" }]
        },
        {
          id: "page-2",
          mode: "standard",
          columns: 1,
          rows: 1,
          cards: [{ id: "second", cardType: CardType.AudioCard, title: "second" }]
        }
      ]),
      page: 1
    });

    expect(cardButtons(wrapper).map((button) => button.text())).to.deep.equal(["second"]);
  });

  it("emits next page and stores explorer page on page turn button click", async () => {
    const store = createVuexStore();
    const wrapper = mountSetGrid({
      config: createConfig([
        {
          id: "page-1",
          mode: "standard",
          columns: 1,
          rows: 1,
          cards: [{ id: "first", cardType: CardType.AudioCard }]
        },
        {
          id: "page-2",
          mode: "standard",
          columns: 1,
          rows: 1,
          cards: [{ id: "second", cardType: CardType.AudioCard }]
        }
      ]),
      page: 0,
      store
    });

    await pageTurnButtons(wrapper)[1].trigger("click");

    expect(wrapper.emitted("update:page")?.[0]).to.deep.equal([1]);
    expect(store.state.explorer.page).to.equal(1);
  });

  it("emits previous page and stores explorer page on page turn button click", async () => {
    const store = createVuexStore();
    const wrapper = mountSetGrid({
      config: createConfig([
        {
          id: "page-1",
          mode: "standard",
          columns: 1,
          rows: 1,
          cards: [{ id: "first", cardType: CardType.AudioCard }]
        },
        {
          id: "page-2",
          mode: "standard",
          columns: 1,
          rows: 1,
          cards: [{ id: "second", cardType: CardType.AudioCard }]
        }
      ]),
      page: 1,
      store
    });

    await pageTurnButtons(wrapper)[0].trigger("click");

    expect(wrapper.emitted("update:page")?.[0]).to.deep.equal([0]);
    expect(store.state.explorer.page).to.equal(0);
  });

  it("disables gaze for page turn buttons in mouse only mode", () => {
    const wrapper = mountSetGrid({
      config: createConfig([
        {
          id: "page-1",
          mode: "standard",
          columns: 1,
          rows: 1,
          cards: [{ id: "first", cardType: CardType.AudioCard }]
        },
        {
          id: "page-2",
          mode: "standard",
          columns: 1,
          rows: 1,
          cards: [{ id: "second", cardType: CardType.AudioCard }]
        }
      ]),
      store: createVuexStore("mouseOnly")
    });

    expect(
      pageTurnButtons(wrapper).map((button) => button.attributes("data-eye-disabled"))
    ).to.deep.equal(["true", "true"]);
  });

  it("allows gaze for page turn buttons in mouse and eyes mode", () => {
    const wrapper = mountSetGrid({
      config: createConfig([
        {
          id: "page-1",
          mode: "standard",
          columns: 1,
          rows: 1,
          cards: [{ id: "first", cardType: CardType.AudioCard }]
        },
        {
          id: "page-2",
          mode: "standard",
          columns: 1,
          rows: 1,
          cards: [{ id: "second", cardType: CardType.AudioCard }]
        }
      ]),
      store: createVuexStore("mouseAndEyes")
    });

    expect(
      pageTurnButtons(wrapper).map((button) => button.attributes("data-eye-disabled"))
    ).to.deep.equal([undefined, undefined]);
  });

  it("hides page turn buttons for quiz pages", () => {
    const wrapper = mountSetGrid({
      config: createConfig([
        {
          id: "page-1",
          mode: "quiz",
          columns: 1,
          rows: 1,
          cards: [{ id: "first", cardType: CardType.AudioCard }]
        },
        {
          id: "page-2",
          mode: "quiz",
          columns: 1,
          rows: 1,
          cards: [{ id: "second", cardType: CardType.AudioCard }]
        }
      ])
    });

    expect(pageTurnButtons(wrapper)).to.have.length(0);
  });

  it("disables empty, new and matched cards", () => {
    const wrapper = mountSetGrid({
      config: createConfig([
        {
          id: "page-1",
          mode: "standard",
          columns: 3,
          rows: 1,
          cards: [
            { id: "matched", cardType: CardType.AudioCard, title: "matched" },
            { id: "empty", cardType: CardType.EmptyCard },
            { id: "new", cardType: CardType.NewCard }
          ]
        }
      ]),
      matchedCardIds: ["matched"]
    });

    expect(cardButtons(wrapper).map((button) => button.attributes("disabled"))).to.deep.equal([
      "",
      "",
      ""
    ]);
  });

  it("marks selected and matched cards with classes", () => {
    const wrapper = mountSetGrid({
      config: createConfig([
        {
          id: "page-1",
          mode: "standard",
          columns: 2,
          rows: 1,
          cards: [
            { id: "selected", cardType: CardType.AudioCard, title: "selected" },
            { id: "matched", cardType: CardType.AudioCard, title: "matched" }
          ]
        }
      ]),
      matchedCardIds: ["matched"],
      selectedCardId: "selected"
    });

    expect(wrapper.find('[data-id="selected"]').classes()).to.include("active");
    expect(wrapper.find('[data-id="matched"]').classes()).to.include("matched");
  });

  it("renders merged cards as a grid span and hides covered slots", () => {
    const wrapper = mountSetGrid({
      config: createConfig([
        {
          id: "page-1",
          mode: "standard",
          columns: 3,
          rows: 1,
          cards: [
            { id: "wide", cardType: CardType.AudioCard, title: "wide", width: 2 },
            { id: "covered", cardType: CardType.NewCard },
            { id: "next", cardType: CardType.AudioCard, title: "next" }
          ]
        }
      ])
    });

    expect(cardButtons(wrapper).map((button) => button.attributes("data-id"))).to.deep.equal([
      "wide",
      "next"
    ]);
    expect(wrapper.find('[data-id="wide"]').attributes("style")).to.contain(
      "grid-column: 1 / span 2"
    );
  });
});

function mountSetGrid({
  config = createConfig(),
  matchedCardIds = [],
  page = 0,
  selectedCardId = null,
  store = createVuexStore()
}: {
  config?: ConfigFile;
  matchedCardIds?: string[];
  page?: number;
  selectedCardId?: string | null;
  store?: ReturnType<typeof createVuexStore>;
} = {}) {
  return mount(SetGrid, {
    props: {
      config,
      file: "set.linka",
      matchedCardIds,
      page,
      selectedCardId
    },
    global: {
      plugins: [store],
      stubs: {
        EyeButton: {
          props: ["eyeDisabled", "lock"],
          template:
            '<button class="eye-button-stub" :class="{ lock }" :data-eye-disabled="eyeDisabled ? \'true\' : null" @click="$emit(&quot;click&quot;)"><slot /></button>'
        },
        SetGridButton: {
          props: ["card", "disabled"],
          template:
            '<button class="card-button" :data-id="card.id" :disabled="disabled" @click="$emit(&quot;click&quot;)">{{ card.title || card.id }}</button>'
        },
        VIcon: true
      }
    }
  });
}

function createVuexStore(pageTurnMode = "mouseAndEyes") {
  return createStore({
    state: {
      button: {
        pageTurnMode
      },
      explorer: {
        page: 0
      },
      ui: {
        exitButton: false,
        outputLine: true
      }
    },
    mutations: {
      explorer_page(state, value: number) {
        state.explorer.page = value;
      }
    }
  });
}

function createConfig(
  pages: ConfigFile["pages"] = [
    {
      id: "page-1",
      mode: "standard",
      columns: 1,
      rows: 1,
      cards: [{ id: "card-1", cardType: CardType.AudioCard, title: "card" }]
    }
  ]
): ConfigFile {
  return {
    version: "3.0",
    withoutSpace: false,
    pages
  };
}

function cardButtons(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll(".card-button");
}

function pageTurnButtons(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll(".eye-button-stub");
}
