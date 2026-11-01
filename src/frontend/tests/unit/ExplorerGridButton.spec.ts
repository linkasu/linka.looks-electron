import chai from "chai";
import { flushPromises, mount } from "@vue/test-utils";
import ExplorerGridButton from "@/frontend/components/HomeView/ExplorerGridButton.vue";
import { storageService } from "@/frontend/services/card-storage-service";

const expect = chai.expect;

describe("ExplorerGridButton", () => {
  it("uses a complete CSS image URL without changing contain sizing", async () => {
    vi.spyOn(storageService, "getDefaultImage").mockResolvedValue(Buffer.from("image"));
    const wrapper = mountExplorerGridButton({
      file: { directory: false, file: "/sets/Игры.linka" }
    });
    await flushPromises();

    expect(wrapper.get(".img").attributes("style")).to.contain('url("blob:unit-test")');
  });

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
