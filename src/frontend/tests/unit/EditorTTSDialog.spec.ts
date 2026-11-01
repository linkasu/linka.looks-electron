import { flushPromises, mount } from "@vue/test-utils";
import { createStore } from "vuex";
import TTSDialog from "@/frontend/components/EditorView/TTSDialog.vue";

const audio = vi.hoisted(() => ({ create: vi.fn(), play: vi.fn() }));
vi.mock("@/frontend/services/card-storage-service", () => ({
  storageService: { createAudioFromText: audio.create }
}));
vi.mock("@/frontend/utils/TTS", () => ({
  TTS: {
    voices: [],
    instance: { resolveVoice: () => "voice", playText: audio.play }
  }
}));

function mountDialog() {
  const enable = vi.fn();
  const wrapper = mount(TTSDialog, {
    props: { file: "test.linka", audioText: "Привет", audioVoice: "voice" },
    global: {
      plugins: [
        createStore({
          state: { ui: { disabled: false } },
          actions: { disable_ui: vi.fn(), enable_ui: enable }
        })
      ],
      stubs: {
        VDialog: {
          props: ["modelValue"],
          emits: ["update:modelValue"],
          template: `<div><slot name="activator" :props="{ onClick: () => $emit('update:modelValue', true) }" /><section v-if="modelValue"><slot /></section></div>`
        },
        VBtn: { props: ["disabled"], template: "<button :disabled='disabled'><slot /></button>" },
        VCard: { template: "<div><slot /></div>" },
        VCardTitle: true,
        VCardText: { template: "<div><slot /></div>" },
        VCardActions: { template: "<div><slot /></div>" },
        VForm: { template: "<div><slot /></div>" },
        VSelect: true,
        VTextarea: true,
        VSpacer: true,
        VAlert: { template: "<div role='alert'><slot /></div>" }
      }
    }
  });
  return { wrapper, enable };
}

describe("Editor TTS dialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("preserves input and restores UI after a creation failure", async () => {
    audio.create.mockRejectedValue(new Error("offline"));
    const { wrapper, enable } = mountDialog();
    await wrapper.get("button").trigger("click");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Добавить озвучку")!
      .trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Не удалось создать озвучку");
    expect(wrapper.emitted("audio")).toBeUndefined();
    expect(enable).toHaveBeenCalledOnce();
    expect(audio.create).toHaveBeenCalledWith("test.linka", "Привет", "voice");
  });

  it("emits the existing audio contract after successful creation", async () => {
    audio.create.mockResolvedValue("voice.mp3");
    const { wrapper } = mountDialog();
    await wrapper.get("button").trigger("click");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Добавить озвучку")!
      .trigger("click");
    await flushPromises();
    expect(wrapper.emitted("audio")).toEqual([
      [
        {
          audioSrcFile: "voice.mp3",
          audioText: "Привет",
          audioVoice: "voice"
        }
      ]
    ]);
    expect(wrapper.find("section").exists()).toBe(false);
  });

  it("reports preview errors without changing the card", async () => {
    audio.play.mockRejectedValue(new Error("offline"));
    const { wrapper } = mountDialog();
    await wrapper.get("button").trigger("click");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Прослушать")!
      .trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Не удалось воспроизвести озвучку");
    expect(wrapper.emitted("audio")).toBeUndefined();
    expect(audio.create).not.toHaveBeenCalled();
  });
});
