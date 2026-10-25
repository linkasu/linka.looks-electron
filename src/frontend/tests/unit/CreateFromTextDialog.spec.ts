import chai from "chai";
import { mount } from "@vue/test-utils";
import { createStore } from "vuex";
import CreateFromTextDialog from "@/frontend/components/EditorView/CreateFromTextDialog.vue";
import { storageService } from "@/frontend/services/card-storage-service";

const expect = chai.expect;
const createImageFromText = storageService.createImageFromText as unknown as ReturnType<
  typeof vi.fn
>;

vi.mock("@/frontend/services/card-storage-service", () => ({
  storageService: {
    createImageFromText: vi.fn(() => Promise.resolve("generated.png"))
  }
}));

describe("CreateFromTextDialog", () => {
  beforeEach(() => {
    createImageFromText.mockClear();
  });

  it("disables confirmation and does not create an image when text is empty or whitespace", async () => {
    const wrapper = mountDialog();

    const confirmBtn = findConfirmButton(wrapper);
    expect((confirmBtn.element as HTMLButtonElement).disabled).to.equal(true);

    await wrapper.get("form").trigger("submit");
    expect(createImageFromText.mock.calls).to.have.length(0);

    await wrapper.get("input").setValue("   ");
    expect((confirmBtn.element as HTMLButtonElement).disabled).to.equal(true);

    await wrapper.get("form").trigger("submit");
    expect(createImageFromText.mock.calls).to.have.length(0);
    expect(wrapper.emitted("image")).to.equal(undefined);
  });

  it("creates an image and emits result when non-empty text is entered", async () => {
    const wrapper = mountDialog();

    await wrapper.get("input").setValue("  Кот  ");
    const confirmBtn = findConfirmButton(wrapper);
    expect((confirmBtn.element as HTMLButtonElement).disabled).to.equal(false);

    await confirmBtn.trigger("click");
    await wrapper.vm.$nextTick();

    expect(createImageFromText.mock.calls[0]).to.deep.equal(["set.linka", "Кот"]);
    expect(wrapper.emitted("image")?.[0]).to.deep.equal(["generated.png"]);
  });
});

function mountDialog() {
  const store = createStore({
    state: {
      ui: {
        disabled: false
      }
    },
    actions: {
      disable_ui: vi.fn(),
      enable_ui: vi.fn()
    }
  });

  return mount(CreateFromTextDialog, {
    props: {
      file: "set.linka"
    },
    global: {
      plugins: [store],
      stubs: {
        VDialog: {
          props: { modelValue: Boolean },
          template:
            "<div><slot name='activator' :props='{}' /><div class='dialog-body'><slot /></div></div>"
        },
        VCard: { template: "<div><slot /></div>" },
        VCardTitle: { template: "<div><slot /></div>" },
        VCardText: { template: "<div><slot /></div>" },
        VCardActions: { template: "<div class='actions'><slot /></div>" },
        VForm: {
          template: "<form @submit.prevent='$emit(&quot;submit&quot;, $event)'><slot /></form>"
        },
        VTextField: {
          props: ["modelValue", "label", "rules"],
          emits: ["update:modelValue"],
          template:
            "<input :value='modelValue' @input='$emit(&quot;update:modelValue&quot;, $event.target.value)' />"
        },
        VBtn: {
          props: { disabled: Boolean },
          template:
            "<button :disabled='disabled' @click='$emit(&quot;click&quot;)'><slot /></button>"
        },
        VIcon: true
      }
    }
  });
}

function findConfirmButton(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll(".actions button")[0];
}
