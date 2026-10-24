import chai from "chai";
import { mount } from "@vue/test-utils";
import { createStore } from "vuex";
import EyeButton from "@/frontend/components/EyeButton.vue";

const expect = chai.expect;

function createVuexStore(options: Partial<ButtonState> = {}) {
  const button: ButtonState = {
    enabled: true,
    borders: 1,
    timeout: 1000,
    clickSound: false,
    eyeSelect: true,
    keyboardActivation: true,
    joystickActivation: true,
    eyeActivation: true,
    ...options
  };

  return createStore({
    state: {
      button
    }
  });
}

describe("eye button", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps editor buttons clickable when gaze lock is disabled", () => {
    const wrapper = mount(EyeButton, {
      props: {
        editor: true
      },
      global: {
        plugins: [createVuexStore({ enabled: false })]
      }
    });

    expect((wrapper.get("button").element as HTMLButtonElement).disabled).to.equal(false);
  });

  it("disables regular buttons when gaze lock is disabled", () => {
    const wrapper = mount(EyeButton, {
      global: {
        plugins: [createVuexStore({ enabled: false })]
      }
    });

    expect((wrapper.get("button").element as HTMLButtonElement).disabled).to.equal(true);
  });

  it("keeps resume discoverable by the gaze watcher while paused but excludes disabled lock targets", async () => {
    const wrapper = mount(EyeButton, {
      props: { lock: true },
      global: { plugins: [createVuexStore({ enabled: false })] }
    });
    expect(wrapper.classes()).to.include("eye");
    dispatchEyeEvent(wrapper, "eye-enter", { eye: true });
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".progress-bar").exists()).to.equal(true);
    await wrapper.setProps({ disabled: true });
    expect(wrapper.classes()).not.to.include("eye");
    expect(wrapper.find(".progress-bar").exists()).to.equal(false);
    expect((wrapper.element as HTMLButtonElement).disabled).to.equal(true);
  });

  it("shows gaze overlay and progress on eye enter", async () => {
    const wrapper = mount(EyeButton, {
      global: {
        plugins: [createVuexStore()]
      }
    });

    dispatchEyeEvent(wrapper, "eye-enter", { eye: true });
    await wrapper.vm.$nextTick();

    expect(wrapper.get("button").classes()).to.include("isInside");
    expect(wrapper.find(".overlay").exists()).to.equal(true);
    expect(wrapper.find(".progress-bar").exists()).to.equal(true);
  });

  it("offers the legacy central circle and applies changes on the next dwell", async () => {
    const store = createVuexStore({ dwellIndicator: "circle" });
    const wrapper = mount(EyeButton, { global: { plugins: [store] } });
    dispatchEyeEvent(wrapper, "eye-enter", { eye: true });
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".dwell-circle").exists()).to.equal(true);
    store.state.button.dwellIndicator = "inward";
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".dwell-circle").exists()).to.equal(true);
    dispatchEyeEvent(wrapper, "eye-exit");
    dispatchEyeEvent(wrapper, "eye-enter", { eye: true });
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".dwell-fill").exists()).to.equal(true);
    expect(wrapper.find(".dwell-circle").exists()).to.equal(false);
    expect(wrapper.get(".progress-bar").attributes("style")).to.contain("--seconds: 1s");
  });

  it("removes gaze overlay on eye exit", async () => {
    const wrapper = mount(EyeButton, {
      global: {
        plugins: [createVuexStore()]
      }
    });

    dispatchEyeEvent(wrapper, "eye-enter", { eye: true });
    await wrapper.vm.$nextTick();
    dispatchEyeEvent(wrapper, "eye-exit");
    await wrapper.vm.$nextTick();

    expect(wrapper.get("button").classes()).not.to.include("isInside");
    expect(wrapper.find(".overlay").exists()).to.equal(false);
  });

  it("clears completed dwell after activation even if the target list is rebuilt", async () => {
    const wrapper = mount(EyeButton, {
      props: { lock: true },
      global: { plugins: [createVuexStore()] }
    });
    dispatchEyeEvent(wrapper, "eye-enter", { eye: true });
    await wrapper.vm.$nextTick();
    await wrapper.trigger("click");
    expect(wrapper.classes()).not.to.include("isInside");
    expect(wrapper.find(".progress-bar").exists()).to.equal(false);
  });

  it("does not show overlay for eye-disabled buttons", async () => {
    const wrapper = mount(EyeButton, {
      props: {
        eyeDisabled: true
      },
      global: {
        plugins: [createVuexStore()]
      }
    });

    dispatchEyeEvent(wrapper, "eye-enter", { eye: true });
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".overlay").exists()).to.equal(false);
  });

  it("allows lock buttons to react to keyboard enter when gaze lock is disabled", async () => {
    const wrapper = mount(EyeButton, {
      props: {
        lock: true
      },
      global: {
        plugins: [createVuexStore({ enabled: false })]
      }
    });

    dispatchEyeEvent(wrapper, "eye-enter", { eye: false });
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".overlay").exists()).to.equal(true);
    expect(wrapper.find(".progress-bar").exists()).to.equal(false);
  });

  it("allows lock buttons to show gaze progress when eye selection is disabled", async () => {
    const wrapper = mount(EyeButton, {
      props: {
        lock: true
      },
      global: {
        plugins: [createVuexStore({ eyeSelect: false })]
      }
    });

    dispatchEyeEvent(wrapper, "eye-enter", { eye: true });
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".overlay").exists()).to.equal(true);
    expect(wrapper.find(".progress-bar").exists()).to.equal(true);
  });

  it("allows lock buttons to show gaze progress when eye activation is disabled", async () => {
    const wrapper = mount(EyeButton, {
      props: {
        lock: true
      },
      global: {
        plugins: [createVuexStore({ eyeActivation: false })]
      }
    });

    dispatchEyeEvent(wrapper, "eye-enter", { eye: true });
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".overlay").exists()).to.equal(true);
    expect(wrapper.find(".progress-bar").exists()).to.equal(true);
  });

  it("plays click sound when enabled", async () => {
    const play = vi.fn();
    const audio = document.createElement("audio");
    audio.id = "button_audio";
    audio.currentTime = 10;
    Object.defineProperty(audio, "play", { value: play });
    document.body.appendChild(audio);
    const wrapper = mount(EyeButton, {
      global: {
        plugins: [createVuexStore({ clickSound: true })]
      }
    });

    await wrapper.get("button").trigger("click");

    expect(audio.currentTime).to.equal(0);
    expect(play.mock.calls).to.have.length(1);
  });

  it("renders a non-interactive preview without nested button or gaze target", async () => {
    const wrapper = mount(EyeButton, {
      props: { preview: true },
      global: { plugins: [createVuexStore()] },
      slots: { default: "Карточка в сообщении" }
    });

    expect(wrapper.find("button").exists()).to.equal(false);
    expect(wrapper.classes()).not.to.include("eye");
    wrapper.element.dispatchEvent(new CustomEvent("eye-enter", { detail: { eye: true } }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".overlay").exists()).to.equal(false);
  });

  it("keeps decorative progress out of the accessibility tree", async () => {
    const wrapper = mount(EyeButton, {
      attrs: { "aria-label": "Выбрать воду" },
      global: { plugins: [createVuexStore()] }
    });
    dispatchEyeEvent(wrapper, "eye-enter", { eye: true });
    await wrapper.vm.$nextTick();
    expect(wrapper.attributes("aria-label")).to.equal("Выбрать воду");
    expect(wrapper.get(".overlay").attributes("aria-hidden")).to.equal("true");
    expect(wrapper.attributes("type")).to.equal("button");
  });
});

interface ButtonState {
  dwellIndicator?: "inward" | "circle";
  enabled: boolean;
  borders: number;
  timeout: number;
  clickSound: boolean;
  eyeSelect: boolean;
  keyboardActivation: boolean;
  joystickActivation: boolean;
  eyeActivation: boolean;
}

function dispatchEyeEvent(
  wrapper: ReturnType<typeof mount>,
  type: string,
  detail: Record<string, unknown> = {}
) {
  wrapper.get("button").element.dispatchEvent(new CustomEvent(type, { detail }));
}
