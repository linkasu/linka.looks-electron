import store from "@/frontend/store";

vi.mock("@/frontend/utils/Telemetry", () => ({ Telemetry: { product: vi.fn() } }));

describe("fixed modal gaze ownership (real store)", () => {
  beforeEach(() => {
    for (const owner of ["tools", "updater"]) {
      store.commit("ui_gazeSuspended", { owner, suspended: false });
    }
  });

  for (const first of ["tools", "updater"]) {
    it(`keeps the other owner suspended after ${first} closes, with idempotent open/close`, () => {
      const second = first === "tools" ? "updater" : "tools";
      store.commit("button_enabled", false);
      store.commit("ui_gazeSuspended", { owner: first, suspended: true });
      store.commit("ui_gazeSuspended", { owner: first, suspended: true });
      store.commit("ui_gazeSuspended", { owner: second, suspended: true });
      expect(store.state.ui.gazeSuspended).toBe(true);
      store.commit("ui_gazeSuspended", { owner: first, suspended: false });
      store.commit("ui_gazeSuspended", { owner: first, suspended: false });
      expect(store.state.ui.gazeSuspended).toBe(true);
      store.commit("ui_gazeSuspended", { owner: second, suspended: false });
      expect(store.state.ui.gazeSuspended).toBe(false);
      expect(store.state.button.enabled).toBe(false);
    });
  }
});
