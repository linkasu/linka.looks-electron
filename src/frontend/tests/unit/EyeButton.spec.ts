import chai from "chai";
import { mount } from "@vue/test-utils";
import { createStore } from "vuex";
import EyeButton from "@/frontend/components/EyeButton.vue";

const expect = chai.expect;

function createVuexStore (enabled: boolean) {
  return createStore({
    state: {
      button: {
        enabled,
        borders: 1,
        timeout: 1000,
        clickSound: false,
        eyeSelect: true,
        keyboardActivation: true,
        joystickActivation: true,
        eyeActivation: true
      }
    }
  });
}

describe("eye button", () => {
  it("keeps editor buttons clickable when gaze lock is disabled", () => {
    const wrapper = mount(EyeButton, {
      props: {
        editor: true
      },
      global: {
        plugins: [createVuexStore(false)]
      }
    });

    expect((wrapper.get("button").element as HTMLButtonElement).disabled).to.equal(false);
  });

  it("disables regular buttons when gaze lock is disabled", () => {
    const wrapper = mount(EyeButton, {
      global: {
        plugins: [createVuexStore(false)]
      }
    });

    expect((wrapper.get("button").element as HTMLButtonElement).disabled).to.equal(true);
  });
});
