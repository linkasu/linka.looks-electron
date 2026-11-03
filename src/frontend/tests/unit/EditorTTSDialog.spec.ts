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
        VSelect: {
          props: ["modelValue", "disabled"],
          emits: ["update:modelValue"],
          template: `<select :disabled="disabled" :value="modelValue" @change="$emit('update:modelValue', $event.target.value)"><option value="voice">Voice</option><option value="other">Other</option></select>`
        },
        VTextarea: {
          props: ["modelValue", "disabled"],
          emits: ["update:modelValue"],
          template: `<textarea :disabled="disabled" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`
        },
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
    expect(wrapper.get("textarea").element.value).toBe("Привет");
    audio.create.mockResolvedValueOnce("retry.mp3");
    await action(wrapper, "Добавить озвучку");
    await flushPromises();
    expect(wrapper.emitted("audio")?.[0]?.[0]).toEqual({
      audioSrcFile: "retry.mp3",
      audioText: "Привет",
      audioVoice: "voice"
    });
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

  it("keeps multiline text and the selected voice through preview, cancel and creation", async () => {
    audio.play.mockResolvedValue(undefined);
    audio.create.mockResolvedValue("multiline.mp3");
    const { wrapper } = mountDialog();
    await wrapper.get("button").trigger("click");
    await wrapper.get("textarea").setValue("Первая строка\nВторая строка");
    await wrapper.get("select").setValue("other");
    await action(wrapper, "Прослушать");
    await flushPromises();
    expect(audio.play).toHaveBeenCalledWith("Первая строка\nВторая строка", "other");
    expect(wrapper.emitted("audio")).toBeUndefined();
    await action(wrapper, "Отменить");
    expect(wrapper.find("section").exists()).toBe(false);
    expect(audio.create).not.toHaveBeenCalled();
    await wrapper.get("button").trigger("click");
    expect(wrapper.get("textarea").element.value).toBe("Привет");
    await wrapper.get("textarea").setValue("Первая строка\nВторая строка");
    await wrapper.get("select").setValue("other");
    await action(wrapper, "Добавить озвучку");
    await flushPromises();
    expect(wrapper.emitted("audio")?.[0]?.[0]).toEqual({
      audioSrcFile: "multiline.mp3",
      audioText: "Первая строка\nВторая строка",
      audioVoice: "other"
    });
  });

  it.each(["Добавить озвучку", "Прослушать"])(
    "blocks double %s and all controls while busy",
    async (label) => {
      let finish!: (result: string) => void;
      const operation = label === "Прослушать" ? audio.play : audio.create;
      operation.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
      const { wrapper } = mountDialog();
      await wrapper.get("button").trigger("click");
      const button = wrapper.findAll("button").find((button) => button.text() === label)!;
      button.element.click();
      button.element.click();
      await wrapper.vm.$nextTick();
      expect(operation).toHaveBeenCalledOnce();
      expect(wrapper.get("textarea").element.disabled).toBe(true);
      expect(wrapper.get("select").element.disabled).toBe(true);
      for (const button of wrapper.findAll<HTMLButtonElement>("section button")) {
        expect(button.element.disabled).toBe(true);
      }
      finish("busy.mp3");
      await flushPromises();
      if (label === "Прослушать") {
        expect(wrapper.get("textarea").element.disabled).toBe(false);
        expect(wrapper.emitted("audio")).toBeUndefined();
      } else {
        expect(wrapper.emitted("audio")).toHaveLength(1);
      }
    }
  );

  it("blocks whitespace and rejects an empty creation response before retry", async () => {
    const { wrapper } = mountDialog();
    await wrapper.get("button").trigger("click");
    await wrapper.get("textarea").setValue(" \n ");
    await action(wrapper, "Добавить озвучку");
    await action(wrapper, "Прослушать");
    expect(audio.create).not.toHaveBeenCalled();
    expect(audio.play).not.toHaveBeenCalled();
    await wrapper.get("textarea").setValue("Привет");
    audio.create.mockResolvedValueOnce("");
    await action(wrapper, "Добавить озвучку");
    await flushPromises();
    expect(wrapper.get("[role=alert]").text()).toContain("Не удалось создать озвучку");
    expect(wrapper.emitted("audio")).toBeUndefined();
    audio.create.mockResolvedValueOnce("retry.mp3");
    await action(wrapper, "Добавить озвучку");
    await flushPromises();
    expect(wrapper.emitted("audio")).toHaveLength(1);
  });
});

async function action(wrapper: ReturnType<typeof mount>, label: string) {
  await wrapper
    .findAll("button")
    .find((button) => button.text() === label)!
    .trigger("click");
}
