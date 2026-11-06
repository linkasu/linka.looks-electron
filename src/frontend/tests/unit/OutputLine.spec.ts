import chai from "chai";
import { flushPromises, mount } from "@vue/test-utils";
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

  it("can restore a cleared message but never carries undo into another set", async () => {
    const cards = [audioCard("one"), audioCard("two")];
    const wrapper = mountOutputLine({ cards });
    await wrapper.get('[aria-label="Очистить сообщение"]').trigger("click");
    await wrapper.setProps({ cards: [] });
    await wrapper.get('[aria-label="Вернуть сообщение"]').trigger("click");
    expect(wrapper.emitted("value")?.[1]).to.deep.equal([cards]);
    await wrapper.setProps({ cards });
    await wrapper.get('[aria-label="Очистить сообщение"]').trigger("click");
    await wrapper.setProps({ cards: [], file: "another.linka" });
    expect(wrapper.find('[aria-label="Вернуть сообщение"]').exists()).to.equal(false);
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

    expect(playText.mock.calls[0]).to.deep.equal(["hello world", undefined, "without-space"]);
    expect(playCards.mock.calls).to.have.length(0);
  });

  it("speaks cards in card-output mode", async () => {
    const cards = [audioCard("hello")];
    const wrapper = mountOutputLine({ cards, withoutSpace: false });

    await eyeButtons(wrapper)[1].trigger("click");

    expect(playCards.mock.calls[0]).to.deep.equal(["set.linka", cards, false, "standard"]);
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

  it.each([false, true])(
    "reports a speech failure and allows retry (withoutSpace=%s)",
    async (withoutSpace) => {
      const play = withoutSpace ? playText : playCards;
      play.mockRejectedValueOnce(new Error("offline"));
      const cards = [audioCard("hello")];
      const wrapper = mountOutputLine({ cards, withoutSpace });
      const unhandled = vi.fn();
      wrapper.vm.$.appContext.config.errorHandler = unhandled;
      await wrapper.get('[aria-label="Произнести сообщение"]').trigger("click");
      await flushPromises();
      expect(wrapper.get('[role="alert"]').text()).to.contain("Не удалось произнести сообщение");
      expect(unhandled.mock.calls).to.have.length(0);
      expect(wrapper.emitted("value")).to.equal(undefined);
      await wrapper.get('[aria-label="Произнести сообщение"]').trigger("click");
      await flushPromises();
      expect(wrapper.find('[role="alert"]').exists()).to.equal(false);
      expect(play.mock.calls).to.have.length(2);
    }
  );

  it("drops undo after new input and renders cards or literal text with spaces", async () => {
    const wrapper = mountOutputLine({ cards: [audioCard("old")] });
    expect(wrapper.get(".card-stub").text()).to.equal("old");
    await wrapper.get('[aria-label="Очистить сообщение"]').trigger("click");
    await wrapper.setProps({ cards: [] });
    await wrapper.setProps({ cards: [audioCard("new")] });
    await wrapper.setProps({ cards: [] });
    expect(wrapper.find('[aria-label="Вернуть сообщение"]').exists()).to.equal(false);
    await wrapper.setProps({
      cards: [
        audioCard("hello"),
        { id: "space", cardType: CardType.SpaceCard },
        audioCard("world")
      ],
      config: { version: "3.0", withoutSpace: true, pages: [] }
    });
    expect(wrapper.get(".text").text()).to.equal("hello world|");
    expect(wrapper.find(".card-stub").exists()).to.equal(false);
  });

  it("autoscrolls new input and ignores repeated speech clicks until playback finishes", async () => {
    const wrapper = mountOutputLine();
    const output = wrapper.get(".output-text").element;
    Object.defineProperty(output, "scrollWidth", { value: 750 });
    await wrapper.setProps({ cards: [audioCard("long message")] });
    await flushPromises();
    expect(output.scrollLeft).to.equal(750);
    let finish!: () => void;
    playCards.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    const speak = wrapper.get('[aria-label="Произнести сообщение"]');
    await speak.trigger("click");
    await speak.trigger("click");
    expect(playCards.mock.calls).to.have.length(1);
    expect(speak.attributes("aria-busy")).to.equal("true");
    finish();
    await flushPromises();
    expect(speak.attributes("aria-busy")).to.equal("false");
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
          emits: ["click"],
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
