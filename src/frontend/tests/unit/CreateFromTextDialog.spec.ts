import { flushPromises, mount } from "@vue/test-utils";
import { createStore } from "vuex";
import CreateFromTextDialog from "@/frontend/components/EditorView/CreateFromTextDialog.vue";
import { storageService } from "@/frontend/services/card-storage-service";

vi.mock("@/frontend/services/card-storage-service", () => ({
  storageService: { createImageFromText: vi.fn() }
}));

describe("CreateFromTextDialog", () => {
  beforeEach(() => {
    vi.mocked(storageService.createImageFromText).mockReset().mockResolvedValue("generated.png");
  });

  it("rejects empty and whitespace submissions, including Enter", async () => {
    const wrapper = mountDialog();
    for (const text of ["", " \r\n\t "]) {
      await wrapper.get("input").setValue(text);
      expect(wrapper.get(".actions button").attributes("disabled")).toBeDefined();
      await wrapper.get("form").trigger("submit");
    }
    expect(storageService.createImageFromText).not.toHaveBeenCalled();
    expect(wrapper.emitted("image")).toBeUndefined();
  });

  it("trims text and forwards the actual selected card dimensions", async () => {
    const wrapper = mountDialog();
    await wrapper.setProps({ getImageSize: () => ({ width: 900, height: 300 }) });
    await wrapper.get("input").setValue("  Кот  ");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(storageService.createImageFromText).toHaveBeenCalledWith("set.linka", "Кот", {
      width: 900,
      height: 300
    });
    expect(wrapper.emitted("image")?.[0]).toEqual(["generated.png"]);
  });

  it("disables the activator and refuses submission while UI is disabled", async () => {
    const wrapper = mountDialog(true);
    expect(wrapper.get("button").attributes("disabled")).toBeDefined();
    await wrapper.get("input").setValue("Кот");
    await wrapper.get("form").trigger("submit");
    expect(storageService.createImageFromText).not.toHaveBeenCalled();
  });

  it("keeps the optional square default for callers without card dimensions", async () => {
    const wrapper = mountDialog();
    await wrapper.get("input").setValue("Кот");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(storageService.createImageFromText).toHaveBeenCalledWith("set.linka", "Кот", undefined);
  });

  it("shows generation errors and lets the user retry the same text", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(storageService.createImageFromText).mockRejectedValueOnce(new Error("Ошибка PNG"));
    const wrapper = mountDialog();
    await wrapper.get("input").setValue("Кот");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain("Ошибка PNG");
    expect(wrapper.emitted("image")).toBeUndefined();
    await wrapper.get(".retry").trigger("click");
    await flushPromises();
    expect(storageService.createImageFromText).toHaveBeenCalledTimes(2);
    expect(wrapper.emitted("image")?.[0]).toEqual(["generated.png"]);
  });
});

function mountDialog(disabled = false) {
  return mount(CreateFromTextDialog, {
    props: { file: "set.linka" },
    global: {
      plugins: [
        createStore({
          state: { ui: { disabled } },
          actions: { disable_ui: vi.fn(), enable_ui: vi.fn() }
        })
      ],
      stubs: {
        VDialog: { template: "<div><slot name='activator' :props='{}' /><slot /></div>" },
        VCard: { template: "<div><slot /></div>" },
        VCardTitle: { template: "<div><slot /></div>" },
        VCardText: { template: "<div><slot /></div>" },
        VCardActions: { template: "<div class='actions'><slot /></div>" },
        VForm: {
          emits: ["submit"],
          template: "<form @submit.prevent='$emit(\"submit\", $event)'><slot /></form>"
        },
        VTextField: {
          props: ["modelValue", "label", "rules"],
          emits: ["update:modelValue"],
          template:
            "<input :value='modelValue' @input='$emit(\"update:modelValue\", $event.target.value)' />"
        },
        VBtn: {
          props: { disabled: Boolean },
          emits: ["click"],
          template: "<button :disabled='disabled' @click='$emit(\"click\")'><slot /></button>"
        },
        VSnackbar: {
          props: ["modelValue"],
          template: "<div v-if='modelValue'><slot /><slot name='actions' /></div>"
        },
        VIcon: true
      }
    }
  });
}
