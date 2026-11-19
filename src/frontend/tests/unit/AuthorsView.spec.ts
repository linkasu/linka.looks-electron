import { mount } from "@vue/test-utils";
import { shell } from "electron";
import AuthorsView from "@/frontend/views/AuthorsView.vue";
import contributors from "@/frontend/contributors.json";

describe("AuthorsView", () => {
  it("shows offline credits, returns back and opens the contact site externally", async () => {
    const back = vi.fn();
    const wrapper = mount(AuthorsView, {
      global: {
        mocks: { $router: { back } },
        stubs: {
          VContainer: { template: "<main><slot /></main>" },
          VCard: { template: "<article><slot /></article>" },
          VCardText: { template: "<div><slot /></div>" },
          VBtn: { template: "<button><slot /></button>" },
          VDivider: true,
          VIcon: true
        }
      }
    });
    expect(wrapper.text()).toContain("Бакаидов Иван Александрович");
    expect(wrapper.text()).toContain("Смирнова Анастасия Владиславовна");
    expect(wrapper.text()).toContain("Смирнов Иван");
    expect(wrapper.findAll("li").map((item) => item.text())).toEqual(contributors);
    await wrapper.get("button").trigger("click");
    expect(back).toHaveBeenCalledOnce();
    await wrapper.get("[href='https://nkolinka.ru']").trigger("click");
    expect(shell.openExternal).toHaveBeenCalledWith("https://nkolinka.ru");
    wrapper.unmount();
  });
});
