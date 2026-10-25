import chai from "chai";
import { mount } from "@vue/test-utils";
import { createStore } from "vuex";
import EyeButton from "@/frontend/components/EyeButton.vue";

const expect = chai.expect;

interface ButtonState {
  enabled: boolean;
  borders: number;
  timeout: number;
  clickSound: boolean;
  eyeSelect: boolean;
  keyboardActivation: boolean;
  joystickActivation: boolean;
  eyeActivation: boolean;
}

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

function dispatchEyeEvent(
  wrapper: ReturnType<typeof mount>,
  type: string,
  detail: Record<string, unknown> = {}
) {
  wrapper.get("button").element.dispatchEvent(new CustomEvent(type, { detail }));
}

describe("eye button dwell and haptic animation", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("hides gaze progress ring once dwell animation ends while keeping card highlighted", async () => {
    const wrapper = mount(EyeButton, {
      global: {
        plugins: [createVuexStore()]
      }
    });

    dispatchEyeEvent(wrapper, "eye-enter", { eye: true });
    await wrapper.vm.$nextTick();

    const progressBar = wrapper.find(".progress-bar");
    expect(progressBar.exists()).to.equal(true);

    progressBar.element.dispatchEvent(new Event("animationend"));
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".progress-bar").exists()).to.equal(false);
    expect(wrapper.get("button").classes()).to.include("isInside");
  });

  it("triggers tactile visual bump on activation and clears progress ring", async () => {
    vi.useFakeTimers();
    const wrapper = mount(EyeButton, {
      global: {
        plugins: [createVuexStore()]
      }
    });

    dispatchEyeEvent(wrapper, "eye-enter", { eye: true });
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".progress-bar").exists()).to.equal(true);

    await wrapper.get("button").trigger("click");

    expect(wrapper.find(".progress-bar").exists()).to.equal(false);
    expect(wrapper.get("button").classes()).to.include("isActivated");

    await vi.advanceTimersByTimeAsync(250);
    await wrapper.vm.$nextTick();

    expect(wrapper.get("button").classes()).not.to.include("isActivated");
  });

  it("skips tactile bump class in editor mode", async () => {
    const wrapper = mount(EyeButton, {
      props: {
        editor: true
      },
      global: {
        plugins: [createVuexStore()]
      }
    });

    await wrapper.get("button").trigger("click");

    expect(wrapper.get("button").classes()).not.to.include("isActivated");
  });
});
