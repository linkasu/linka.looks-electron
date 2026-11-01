import chai from "chai";
import { mount } from "@vue/test-utils";
import ExitButton from "@/frontend/components/EditorView/ExitButton.vue";

const expect = chai.expect;

function mountExitButton(confirm?: boolean) {
  return mount(ExitButton, {
    props: confirm === undefined ? {} : { confirm },
    global: {
      stubs: {
        VBtn: {
          template: "<button><slot /></button>"
        },
        VIcon: {
          template: "<span><slot /></span>"
        },
        VDialog: {
          props: ["modelValue"],
          emits: ["update:modelValue"],
          template:
            "<div><slot name='activator' :props='{ onClick: () => $emit(\"update:modelValue\", true) }' /><div v-if='modelValue' data-testid='exit-dialog'><slot /></div></div>"
        },
        VCard: { template: "<div><slot /></div>" },
        VCardTitle: { template: "<div><slot /></div>" },
        VCardText: { template: "<div><slot /></div>" },
        VCardActions: { template: "<div><slot /></div>" }
      }
    }
  });
}

describe("ExitButton", () => {
  it("exits immediately without confirmation dialog when confirm is false", async () => {
    const wrapper = mountExitButton(false);

    await wrapper.get('[aria-label="Выйти из редактора"]').trigger("click");

    expect(wrapper.emitted("exit")).to.have.length(1);
    expect(wrapper.find("[data-testid='exit-dialog']").exists()).to.equal(false);
  });

  it("asks for confirmation before exiting when confirm is true", async () => {
    const wrapper = mountExitButton(true);

    await wrapper.get('[aria-label="Выйти из редактора"]').trigger("click");

    expect(wrapper.emitted("exit")).to.equal(undefined);
    expect(wrapper.find("[data-testid='exit-dialog']").exists()).to.equal(true);
    expect(wrapper.text()).to.contain("Выйти без сохранения?");

    await wrapper.get("[data-testid='exit-dialog'] button:last-child").trigger("click");
    expect(wrapper.emitted("exit")).to.equal(undefined);
    expect(wrapper.find("[data-testid='exit-dialog']").exists()).to.equal(false);

    await wrapper.get('[aria-label="Выйти из редактора"]').trigger("click");
    await wrapper.get("[data-testid='exit-dialog'] button:first-child").trigger("click");
    expect(wrapper.emitted("exit")).to.have.length(1);
  });
});
