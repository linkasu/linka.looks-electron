import chai from "chai";
import { mount } from "@vue/test-utils";
import { createStore } from "vuex";
import OutputLine from "@/frontend/components/OutputLine.vue";
import { CardType, type Card } from "@/common/interfaces/ConfigFile";
import { TTS } from "@/frontend/utils/TTS";

const expect = chai.expect;
const playCards = TTS.instance.playCards as unknown as ReturnType<typeof vi.fn>;
const playText = TTS.instance.playText as unknown as ReturnType<typeof vi.fn>;

vi.mock("@/frontend/utils/TTS", () => ({
  TTS: {
    instance: {
      playCards: vi.fn(() => Promise.resolve()),
      playText: vi.fn(() => Promise.resolve())
    }
  }
}));

describe("OutputLine", () => {
  beforeEach(() => {
    playCards.mockClear();
    playText.mockClear();
  });

  it("emits empty card list when clear is clicked", async () => {
    const wrapper = mountOutputLine({ cards: [audioCard("one")] });

    await eyeButtons(wrapper)[3].trigger("click");

    expect(wrapper.emitted("value")?.[0]).to.deep.equal([[]]);
  });

  it("emits cards without the last item when backspace is clicked", async () => {
    const cards = [audioCard("one"), audioCard("two")];
    const wrapper = mountOutputLine({ cards });

    await eyeButtons(wrapper)[2].trigger("click");

    expect(wrapper.emitted("value")?.[0]).to.deep.equal([[cards[0]]]);
  });

  it("speaks concatenated text in without-space mode", async () => {
    const wrapper = mountOutputLine({
      cards: [
        audioCard("hello"),
        { id: "space", cardType: CardType.SpaceCard },
        audioCard("world")
      ],
      withoutSpace: true
    });

    await eyeButtons(wrapper)[1].trigger("click");

    expect(playText.mock.calls[0]).to.deep.equal(["hello world"]);
    expect(playCards.mock.calls).to.have.length(0);
  });

  it("speaks cards in card-output mode", async () => {
    const cards = [audioCard("hello")];
    const wrapper = mountOutputLine({ cards, withoutSpace: false });

    await eyeButtons(wrapper)[1].trigger("click");

    expect(playCards.mock.calls[0]).to.deep.equal(["set.linka", cards]);
    expect(playText.mock.calls).to.have.length(0);
  });

  it("toggles gaze lock through store action", async () => {
    const store = createVuexStore();
    const wrapper = mountOutputLine({ store });

    await eyeButtons(wrapper)[0].trigger("click");

    expect((store.dispatch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).to.equal(
      "button_enabled"
    );
  });
});

function mountOutputLine({
  cards = [],
  store = createVuexStore(),
  withoutSpace = false
}: {
  cards?: Card[];
  store?: ReturnType<typeof createVuexStore>;
  withoutSpace?: boolean;
} = {}) {
  return mount(OutputLine, {
    props: {
      cards,
      config: {
        version: "3.0",
        withoutSpace,
        pages: []
      },
      file: "set.linka"
    },
    global: {
      plugins: [store],
      stubs: {
        EyeButton: {
          props: ["color", "lock"],
          template:
            '<button class="eye-button-stub" @click="$emit(&quot;click&quot;)"><slot /></button>'
        },
        SetGridButton: {
          props: ["card"],
          template: '<div class="card-stub">{{ card.title }}</div>'
        },
        VIcon: true,
        VLayout: {
          template: "<div><slot /></div>"
        }
      }
    }
  });
}

function createVuexStore() {
  const store = createStore({
    state: {
      button: {
        enabled: true
      },
      ui: {
        exitButton: false
      }
    },
    actions: {
      button_enabled: vi.fn()
    }
  });
  vi.spyOn(store, "dispatch");
  return store;
}

function audioCard(title: string): Card {
  return {
    id: title,
    cardType: CardType.AudioCard,
    title
  };
}

function eyeButtons(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll(".eye-button-stub");
}
