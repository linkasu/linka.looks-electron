import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { createStore } from "vuex";
import ColorsSettings from "@/frontend/components/Settings/ColorsSettings.vue";
import KeyBinding from "@/frontend/components/Settings/KeyBinding.vue";
import VoiceSettings from "@/frontend/components/Settings/VoiceSettings.vue";

const { playText } = vi.hoisted(() => ({ playText: vi.fn() }));
vi.mock("@/frontend/utils/TTS", () => ({
  TTS: {
    voices: [
      { value: "ru", text: "Русский", langCode: "ru" },
      { value: "en", text: "English", langCode: "en" }
    ],
    instance: { playText }
  }
}));

const Button = defineComponent({
  template: "<button @click=\"$emit('click')\"><slot /></button>"
});
const Slot = defineComponent({ template: "<div><slot /></div>" });
const stubs = {
  "v-btn": Button,
  "v-sheet": Slot,
  "v-card": Slot,
  "v-card-title": Slot,
  "v-card-text": Slot,
  "v-card-actions": Slot,
  "v-chip": Slot,
  "v-icon": Slot,
  "v-text-field": true,
  "v-select": true,
  "v-form": Slot,
  "v-slider": true,
  EyeButton: true
};

describe("settings visual audit behavior", () => {
  it("shows voice preview loading and recovers after a playback error", async () => {
    let rejectPreview: (reason: Error) => void = () => {};
    playText.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectPreview = reject;
        })
    );
    const store = createStore({ state: { voiceRu: "ru", voiceEn: "en" } });
    const wrapper = mount(VoiceSettings, { global: { plugins: [store], stubs } });
    await wrapper.findAll("button")[0].trigger("click");
    expect(wrapper.findAll("button")[0].attributes("loading")).toBe("true");
    expect(wrapper.findAll("button")[1].attributes("disabled")).toBeDefined();
    rejectPreview(new Error("offline"));
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("Не удалось");
    expect(wrapper.findAll("button")[1].attributes("disabled")).toBeUndefined();
    wrapper.unmount();
  });

  it("preserves saved colors until a preset is explicitly selected", async () => {
    const store = createStore({
      state: {
        colors: { primary: "#112233", accent: "#445566", secondary: "#778899" },
        button: { borders: 0 }
      },
      mutations: {
        colors_primary: (state, value) => {
          state.colors.primary = value;
        },
        colors_accent: (state, value) => {
          state.colors.accent = value;
        },
        colors_secondary: (state, value) => {
          state.colors.secondary = value;
        },
        button_borders: (state, value) => {
          state.button.borders = value;
        }
      }
    });
    const wrapper = mount(ColorsSettings, { global: { plugins: [store], stubs } });
    expect(store.state.colors.primary).toBe("#112233");
    expect(store.state.button.borders).toBe(0);
    await wrapper.findAll("button")[1].trigger("click");
    expect(store.state.colors.secondary).toBe("#000000");
    expect(store.state.button.borders).toBe(1);
    await wrapper.findAll("button")[0].trigger("click");
    expect(store.state.colors).toEqual({
      primary: "#197377",
      accent: "#E2EEEA",
      secondary: "#778C84"
    });
    wrapper.unmount();
  });

  it("cancels listening with Escape without changing existing assignments", async () => {
    const store = createStore({
      state: { selectedKey: undefined as string | undefined, keyMapping: { up: ["ArrowUp"] } },
      mutations: {
        selectedKey: (state, value) => {
          state.selectedKey = value;
        }
      },
      actions: {
        keymap_push: ({ state }, { code }) => {
          state.keyMapping.up.push(code);
          state.selectedKey = undefined;
        }
      }
    });
    const wrapper = mount(KeyBinding, {
      props: { side: "up" },
      global: { plugins: [store], stubs }
    });
    await wrapper.get(".assign-key").trigger("click");
    expect(wrapper.get('[role="status"]').text()).toContain("Ожидание");
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
    await wrapper.vm.$nextTick();
    expect(store.state.selectedKey).toBeUndefined();
    expect(store.state.keyMapping.up).toEqual(["ArrowUp"]);
    await wrapper.get(".assign-key").trigger("click");
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    await wrapper.vm.$nextTick();
    expect(store.state.keyMapping.up).toEqual(["ArrowUp", "KeyW"]);
    expect(store.state.selectedKey).toBeUndefined();
    await wrapper.get(".assign-key").trigger("click");
    wrapper.unmount();
    expect(store.state.selectedKey).toBeUndefined();
  });
});
