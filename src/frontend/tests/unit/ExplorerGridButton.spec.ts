import chai from "chai";
import { mount } from "@vue/test-utils";
import ExplorerGridButton from "@/frontend/components/HomeView/ExplorerGridButton.vue";

const expect = chai.expect;

describe("ExplorerGridButton", () => {
  it("shows folder names on the home grid", () => {
    const wrapper = mountExplorerGridButton({
      file: {
        directory: true,
        file: "/sets/Миша"
      }
    });

    expect(wrapper.get(".label").text()).to.equal("Миша");
  });

  it("shows set names without the linka extension", () => {
    const wrapper = mountExplorerGridButton({
      file: {
        directory: false,
        file: "/sets/Игры.linka"
      }
    });

    expect(wrapper.get(".label").text()).to.equal("Игры");
  });

  it("shows the back button label", () => {
    const wrapper = mountExplorerGridButton({
      back: true
    });

    expect(wrapper.get(".label").text()).to.equal("Шаг назад");
  });
});

function mountExplorerGridButton(props: Record<string, unknown>) {
  return mount(ExplorerGridButton, {
    props,
    global: {
      stubs: {
        EyeButton: {
          template: "<button><slot /></button>"
        },
        VIcon: {
          template: "<i><slot /></i>"
        }
      }
    }
  });
}
