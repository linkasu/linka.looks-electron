import { describe, expect, it, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";
import { createStore } from "vuex";
import { defineComponent } from "vue";
import SettingsView from "@/frontend/views/SettingsView.vue";

vi.mock("electron", () => ({ shell: { openExternal: vi.fn() } }));
vi.mock("@/frontend/utils/Telemetry", () => ({ Telemetry: { product: vi.fn() } }));
vi.mock("@/frontend/utils/TTS", () => ({ TTS: { voices: [], instance: {} } }));

const Slot = defineComponent({ template: "<div><slot /></div>" });
const Checkbox = defineComponent({
  name: "VCheckbox",
  props: ["label", "modelValue"],
  template: '<input :aria-label="label" />'
});
const Slider = defineComponent({
  name: "VSlider",
  props: ["modelValue"],
  template: "<input />"
});

describe("settings task flow follow-up", () => {
  it("keeps mixed saved inputs and dwell timing while the safe trial only reports activation", async () => {
    const state = {
      button: {
        enabled: true,
        eyeSelect: true,
        eyeActivation: true,
        mouseActivation: true,
        keyboardActivation: false,
        joystickActivation: true,
        timeout: 1700,
        clickSound: false,
        animation: false,
        borders: 1,
        pageTurnMode: "mouseAndEyes"
      },
      ui: { exitButton: true },
      telemetryConsent: "disabled"
    };
    const store = createStore({
      state,
      mutations: {
        button_timeout: (state, value) => {
          state.button.timeout = value;
        },
        button_keyboardActivation: (state, value) => {
          state.button.keyboardActivation = value;
        }
      }
    });
    const commit = vi.spyOn(store, "commit");
    const before = structuredClone(state);
    const wrapper = shallowMount(SettingsView, {
      global: {
        plugins: [store],
        stubs: {
          EyeButton: false,
          "v-container": Slot,
          "v-row": Slot,
          "v-col": Slot,
          "v-card": Slot,
          "v-card-title": Slot,
          "v-card-text": Slot,
          "v-btn": Slot,
          "v-select": true,
          "v-divider": true,
          "v-checkbox": Checkbox,
          "v-slider": Slider,
          "v-chip": Slot,
          "v-radio-group": Slot,
          "v-radio": true
        },
        renderStubDefaultSlot: true
      }
    });
    expect(store.state).toEqual(before);
    expect(wrapper.findAll("h2").map((heading) => heading.text())).toEqual([
      "1. Как выбирать карточку",
      "2. Как запускать действие",
      "3. Сколько удерживать взгляд",
      "Проверить без последствий"
    ]);
    await wrapper.get('[data-testid="settings-trial-button"]').trigger("click");
    expect(wrapper.get('[data-testid="settings-trial-status"]').text()).toBe("Сработало: 1");
    expect(commit).not.toHaveBeenCalled();
    expect(store.state).toEqual(before);

    const keyboard = wrapper
      .findAllComponents({ name: "v-checkbox" })
      .find((checkbox) => checkbox.props("label") === "Активация клавиатурой");
    expect(keyboard).toBeDefined();
    keyboard!.vm.$emit("update:modelValue", true);
    wrapper.getComponent({ name: "v-slider" }).vm.$emit("update:modelValue", 2.3);
    await wrapper.vm.$nextTick();
    expect(store.state.button).toEqual({
      ...before.button,
      keyboardActivation: true,
      timeout: 2300
    });
    wrapper.unmount();
  });
});
