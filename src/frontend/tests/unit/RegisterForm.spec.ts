import { flushPromises, mount } from "@vue/test-utils";
import { createStore } from "vuex";
import RegisterForm from "@/frontend/views/RegisterForm.vue";
import { activationService } from "@/frontend/services/ActivationService";

describe("RegisterForm", () => {
  it("keeps code submission visible and disabled until six characters are entered", async () => {
    vi.spyOn(activationService, "sendEmail").mockResolvedValue();
    const activate = vi.spyOn(activationService, "activate").mockResolvedValue("hash");
    const store = createStore({ state: {}, mutations: { pcHash: vi.fn() } });
    const wrapper = mount(RegisterForm, {
      global: {
        plugins: [store],
        stubs: {
          VDialog: { template: "<div><slot /></div>" },
          VCard: { template: "<article><slot /></article>" },
          VCardTitle: { template: "<h2><slot /></h2>" },
          VCardText: { template: "<div><slot /></div>" },
          VCardActions: { template: "<div><slot /></div>" },
          VSpacer: true,
          VAlert: { template: "<aside><slot /></aside>" },
          VForm: { template: "<form><slot /></form>" },
          VBtn: { template: "<button><slot /></button>" },
          VTextField: {
            props: ["modelValue"],
            template: `<input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`
          }
        }
      }
    });

    await wrapper.get("input").setValue("test@example.com");
    await wrapper.get("button").trigger("click");
    await flushPromises();

    const submit = wrapper.findAll("button").find((button) => button.text() === "Проверить код")!;
    expect(submit.attributes()).toHaveProperty("disabled");
    expect(wrapper.get("input").attributes("inputmode")).toBe("numeric");
    expect(wrapper.get("input").attributes("autocomplete")).toBe("one-time-code");
    await wrapper.get("input").setValue("12345");
    expect(submit.attributes()).toHaveProperty("disabled");
    await wrapper.get("input").setValue("123456");
    expect(submit.attributes()).not.toHaveProperty("disabled");
    await submit.trigger("click");
    await flushPromises();
    expect(activate).toHaveBeenCalledWith("test@example.com", "123456");
  });
});
