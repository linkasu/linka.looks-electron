import chai from "chai";
import { mount } from "@vue/test-utils";
import { createStore } from "vuex";
import { shell } from "electron";
import TelemetryConsentNotice from "@/frontend/components/TelemetryConsentNotice.vue";

const expect = chai.expect;
const openExternal = shell.openExternal as unknown as ReturnType<typeof vi.fn>;

describe("TelemetryConsentNotice", () => {
  beforeEach(() => {
    openExternal.mockClear();
  });

  it("explains excluded data and persists opt-out", async () => {
    const store = createConsentStore();
    const wrapper = mountNotice(store);

    expect(wrapper.text()).to.contain(
      "Содержимое карточек, названия файлов, пути и тексты ошибок не отправляются"
    );

    await wrapper.get("[data-testid='telemetry-disable']").trigger("click");

    expect(store.state.telemetryConsent).to.equal("disabled");
  });

  it("persists opt-in and opens the detailed privacy notice", async () => {
    const store = createConsentStore();
    const wrapper = mountNotice(store);

    await wrapper.get("[data-testid='telemetry-privacy']").trigger("click");
    expect(openExternal.mock.calls[0]).to.deep.equal(["https://metric.linka.su/privacy"]);

    await wrapper.get("[data-testid='telemetry-enable']").trigger("click");
    expect(store.state.telemetryConsent).to.equal("enabled");
  });

  it("can be dismissed without changing the unknown state", async () => {
    const store = createConsentStore();
    const wrapper = mountNotice(store);

    await wrapper.get("[data-testid='telemetry-defer']").trigger("click");

    expect(store.state.telemetryConsent).to.equal("unknown");
    expect(wrapper.text()).not.to.contain("Техническая статистика");
  });
});

function createConsentStore() {
  return createStore({
    state: {
      telemetryConsent: "unknown"
    },
    mutations: {
      telemetryConsent(state, value: "enabled" | "disabled") {
        state.telemetryConsent = value;
      }
    },
    actions: {
      setTelemetryPreference({ commit }, value: "enabled" | "disabled") {
        commit("telemetryConsent", value);
      }
    }
  });
}

function mountNotice(store: ReturnType<typeof createConsentStore>) {
  return mount(TelemetryConsentNotice, {
    global: {
      plugins: [store],
      stubs: {
        VSnackbar: {
          props: ["modelValue"],
          template: "<aside v-if='modelValue'><slot /><slot name='actions' /></aside>"
        },
        VBtn: { template: "<button @click='$emit(&quot;click&quot;)'><slot /></button>" }
      }
    }
  });
}
