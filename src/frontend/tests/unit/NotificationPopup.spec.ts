import { flushPromises, mount } from "@vue/test-utils";
import { reactive } from "vue";
import { createStore } from "vuex";
import axios from "axios";
import NotificationPopup from "@/frontend/components/NotificationPopup.vue";

vi.mock("vue-router", () => ({ useRoute: () => route }));
const route = reactive({ name: "SetExplorer" });

describe("NotificationPopup", () => {
  it("defers unread announcements until home without marking them read", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({
      data: { version: 2, title: "Новость", description: "Подробности", links: {} }
    });
    const store = createStore({
      state: { popupVersion: 0 },
      mutations: {
        popupVersion(state, version: number) {
          state.popupVersion = version;
        }
      }
    });
    const wrapper = mount(NotificationPopup, {
      global: {
        plugins: [store],
        stubs: {
          VDialog: { props: ["modelValue"], template: "<div v-if='modelValue'><slot /></div>" },
          VCard: { template: "<article><slot /></article>" },
          VCardTitle: { template: "<h2><slot /></h2>" },
          VCardText: { template: "<div><slot /></div>" },
          VCardActions: { template: "<div><slot /></div>" },
          VList: { template: "<div><slot /></div>" },
          VListItem: true,
          VListItemTitle: true,
          VBtn: { template: "<button><slot /></button>" },
          VSpacer: true
        }
      }
    });
    await flushPromises();
    expect(wrapper.text()).not.toContain("Новость");
    expect(store.state.popupVersion).toBe(0);
    route.name = "home";
    await flushPromises();
    expect(wrapper.text()).toContain("Новость");
    await wrapper.get("button").trigger("click");
    expect(store.state.popupVersion).toBe(2);
    expect(wrapper.text()).not.toContain("Новость");
    wrapper.unmount();
  });
});
