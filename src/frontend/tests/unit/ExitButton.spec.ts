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
          template: "<div v-if='modelValue' data-testid='exit-dialog'><slot /></div>"
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

    await wrapper.get("[data-testid='editor-exit-btn']").trigger("click");

    expect(wrapper.emitted("exit")).to.have.length(1);
    expect(wrapper.find("[data-testid='exit-dialog']").exists()).to.equal(false);
  });

  it("asks for confirmation before exiting when confirm is true", async () => {
    const wrapper = mountExitButton(true);

    await wrapper.get("[data-testid='editor-exit-btn']").trigger("click");

    expect(wrapper.emitted("exit")).to.equal(undefined);
    expect(wrapper.find("[data-testid='exit-dialog']").exists()).to.equal(true);
    expect(wrapper.text()).to.contain("Выйти без сохранения?");

    await wrapper.get("[data-testid='editor-exit-cancel']").trigger("click");
    expect(wrapper.emitted("exit")).to.equal(undefined);
    expect(wrapper.find("[data-testid='exit-dialog']").exists()).to.equal(false);

    await wrapper.get("[data-testid='editor-exit-btn']").trigger("click");
    await wrapper.get("[data-testid='editor-exit-confirm']").trigger("click");
    expect(wrapper.emitted("exit")).to.have.length(1);
  });
});
