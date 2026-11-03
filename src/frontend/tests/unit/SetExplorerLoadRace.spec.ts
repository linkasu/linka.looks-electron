import { flushPromises, shallowMount } from "@vue/test-utils";
import { reactive } from "vue";
import SetExplorer from "@/frontend/views/SetExplorerView.vue";
import SetExplorerAppbar from "@/frontend/views/SetExplorerView.appbar.vue";
import store from "@/frontend/store";
import { storageService } from "@/frontend/services/card-storage-service";
import { CURRENT_SET_VERSION } from "@/common/interfaces/ConfigFile";
import { Telemetry } from "@/frontend/utils/Telemetry";

let route: { params: { path: string }; fullPath: string };
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("vue-router", () => ({ useRoute: () => route, useRouter: () => router }));
vi.mock("@/frontend/services/card-storage-service", () => ({
  storageService: { getConfigFile: vi.fn(), copyToTemp: vi.fn(), defaultToTemp: vi.fn() }
}));
vi.mock("@/frontend/utils/TTS", () => ({ TTS: { instance: {} } }));
vi.mock("@/frontend/utils/Telemetry", () => ({
  Telemetry: { product: vi.fn(), getPreference: vi.fn(async () => "unknown") }
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const config = (question: string) => ({
  version: CURRENT_SET_VERSION,
  withoutSpace: false,
  description: question,
  pages: [{ id: question, mode: "standard" as const, rows: 1, columns: 1, cards: [], question }]
});

beforeEach(() => {
  store.dispatch("editor_current_default");
  route = reactive({ params: { path: "A.linka" }, fullPath: "/set/A.linka" });
  store.commit("explorer_config", undefined);
  store.commit("layoutSettings_isOpened", false);
  vi.mocked(storageService.getConfigFile).mockReset();
  vi.mocked(storageService.copyToTemp)
    .mockReset()
    .mockImplementation(async (file) => `temp-${file}`);
});

it("distinguishes A→B→A loads rather than accepting an older matching filename", async () => {
  const old = deferred<ReturnType<typeof config>>();
  let aReads = 0;
  vi.mocked(storageService.getConfigFile).mockImplementation(async (file) => {
    if (file === "A.linka") return ++aReads === 1 ? old.promise : config("new A");
    return config(file);
  });
  const wrapper = shallowMount(SetExplorer, { global: { plugins: [store] } });
  route.params.path = "B.linka";
  await flushPromises();
  route.params.path = "A.linka";
  await flushPromises();
  const latestEditor = JSON.parse(JSON.stringify(store.state.editor));
  old.resolve(config("old A"));
  await flushPromises();
  expect(store.state.explorer.config?.description).toBe("new A");
  expect(store.state.editor).toEqual(latestEditor);
  expect(
    vi.mocked(Telemetry.product).mock.calls.filter(([event]) => event === "openSet")
  ).toHaveLength(2);
  wrapper.unmount();
});

for (const stage of ["explorer", "editor"] as const) {
  it(`invalidates pending ${stage} publication on unmount without stale telemetry or errors`, async () => {
    const pending = deferred<ReturnType<typeof config>>();
    vi.mocked(storageService.getConfigFile).mockImplementation(async (file) =>
      file === (stage === "explorer" ? "A.linka" : "temp-A.linka") ? pending.promise : config(file)
    );
    const wrapper = shallowMount(SetExplorer, { global: { plugins: [store] } });
    await flushPromises();
    wrapper.unmount();
    const explorer = store.state.explorer.config;
    const editor = JSON.parse(JSON.stringify(store.state.editor));
    pending.resolve(config("unmounted A"));
    await flushPromises();
    expect(store.state.explorer.config).toBe(explorer);
    expect(store.state.editor).toEqual(editor);
    expect(
      vi.mocked(Telemetry.product).mock.calls.filter(([event]) => event === "openSet")
    ).toHaveLength(0);
  });
}

for (const [action, outcome] of [
  ["editor_current", "success"],
  ["editor_current", "error"],
  ["editor_load_set", "success"],
  ["editor_load_set", "error"]
] as const) {
  it(`guards the actual ${action} config ${outcome} and keeps the winning editor state coherent`, async () => {
    const old = deferred<ReturnType<typeof config>>();
    store.commit("editor_temp", "temp-A.linka");
    vi.mocked(storageService.getConfigFile).mockImplementation(async (file) =>
      file === "temp-A.linka" ? old.promise : config(file)
    );
    const first = store.dispatch(action, action === "editor_current" ? "A.linka" : undefined);
    await flushPromises();
    await store.dispatch("editor_current", "B.linka");
    const latest = JSON.parse(JSON.stringify(store.state.editor));
    if (outcome === "success") old.resolve(config("old A"));
    else old.reject(new Error("old editor unavailable"));
    expect(await first).toBe(false);
    expect(store.state.editor).toEqual(latest);
    expect(store.state.editor.current).toBe("B.linka");
    expect(store.state.editor.temp).toBe("temp-B.linka");
    expect(store.state.editor.pages[0].id).toBe("temp-B.linka");
    expect(store.getters.editor_hasChanges).toBe(false);
  });
}

it("invalidates new-file results when the editor resets to default", async () => {
  const old = deferred<string>();
  vi.mocked(storageService.defaultToTemp).mockReturnValueOnce(old.promise);
  vi.mocked(storageService.getConfigFile).mockResolvedValue(config("old A"));
  const first = store.dispatch("editor_new_file", "A");
  await store.dispatch("editor_current_default");
  const latest = JSON.parse(JSON.stringify(store.state.editor));
  old.resolve("temp-A.linka");
  expect(await first).toBe(false);
  expect(store.state.editor).toEqual(latest);
  expect(storageService.getConfigFile).not.toHaveBeenCalled();
});

it("does not let an older owner invalidate a newer load", async () => {
  store.commit("set_load_invalidate");
  const oldOwner = store.state.setLoadRevision;
  const pending = deferred<ReturnType<typeof config>>();
  vi.mocked(storageService.getConfigFile).mockReturnValueOnce(pending.promise);
  const loading = store.dispatch("editor_current", "B.linka");
  const newOwner = store.state.setLoadRevision;
  await flushPromises();
  store.commit("set_load_invalidate", oldOwner);
  expect(store.state.setLoadRevision).toBe(newOwner);
  pending.resolve(config("B"));
  expect(await loading).toBe(true);
  expect(store.state.editor.current).toBe("B.linka");
});

it("does not cancel a new editor load when an already released explorer unmounts", async () => {
  const old = deferred<ReturnType<typeof config>>();
  vi.mocked(storageService.getConfigFile).mockImplementation(async (file) =>
    file === "A.linka" ? old.promise : config(file)
  );
  const wrapper = shallowMount(SetExplorer, { global: { plugins: [store] } });
  route.params.path = "";
  await flushPromises();
  const next = deferred<string>();
  vi.mocked(storageService.copyToTemp).mockReturnValueOnce(next.promise);
  const loading = store.dispatch("editor_current", "B.linka");
  wrapper.unmount();
  next.resolve("temp-B.linka");
  old.resolve(config("old A"));
  expect(await loading).toBe(true);
  expect(store.state.editor.current).toBe("B.linka");
  expect(store.state.editor.temp).toBe("temp-B.linka");
});

it("keeps a coherent editor baseline until validation succeeds and reports a current load failure", async () => {
  vi.mocked(storageService.getConfigFile).mockResolvedValueOnce(config("saved"));
  await store.dispatch("editor_current", "saved.linka");
  const latest = JSON.parse(JSON.stringify(store.state.editor));
  vi.mocked(storageService.getConfigFile).mockResolvedValueOnce(null);
  expect(await store.dispatch("editor_current", "invalid.linka")).toBe(false);
  expect(store.state.editor).toEqual(latest);
  vi.mocked(storageService.copyToTemp).mockRejectedValueOnce(new Error("current unavailable"));
  const error = await store.dispatch("editor_current", "missing.linka").catch((reason) => reason);
  expect(error.message).toBe("current unavailable");
  expect(store.state.editor).toEqual(latest);
});

it("publishes a default editor reset as one coherent current/temp/pages/baseline mutation", async () => {
  vi.mocked(storageService.getConfigFile).mockResolvedValueOnce(config("saved"));
  await store.dispatch("editor_current", "saved.linka");
  const publications: unknown[] = [];
  const unsubscribe = store.subscribe((mutation, state) => {
    if (mutation.type.startsWith("editor_")) {
      publications.push({
        current: state.editor.current,
        temp: state.editor.temp,
        page: state.editor.page,
        dirty: store.getters.editor_hasChanges
      });
    }
  });
  await store.dispatch("editor_current_default");
  unsubscribe();
  expect(publications).toEqual([{ current: "", temp: "", page: 0, dirty: false }]);
});

it("keeps public view/appbar edit and settings blocked until the matching editor copy is ready", async () => {
  const copy = deferred<string>();
  vi.mocked(storageService.copyToTemp).mockImplementation(async (file) =>
    file === "B.linka" ? copy.promise : `temp-${file}`
  );
  vi.mocked(storageService.getConfigFile).mockImplementation(async (file) => config(file));
  const viewer = shallowMount(SetExplorer, { global: { plugins: [store] } });
  await flushPromises();
  const appbar = shallowMount(SetExplorerAppbar, {
    global: {
      plugins: [store],
      stubs: {
        VAppBar: { template: "<header><slot /></header>" },
        VBtn: { props: ["disabled"], template: "<button :disabled='disabled'><slot /></button>" },
        VDialog: true,
        VIcon: true,
        VAppBarTitle: true
      }
    }
  });
  route.params.path = "B.linka";
  route.fullPath = "/set/B.linka";
  await flushPromises();
  expect(store.state.editor.current).toBe("A.linka");
  expect(store.state.explorer.config).toBeUndefined();
  const settings = appbar.get<HTMLButtonElement>("[aria-label='Настройки отображения']");
  const edit = appbar.get<HTMLButtonElement>("[aria-label='Редактировать набор']");
  expect(settings.element.disabled).toBe(true);
  expect(edit.element.disabled).toBe(true);
  await settings.trigger("click");
  expect(store.state.layoutSettings.isOpened).toBe(false);
  copy.resolve("temp-B.linka");
  await flushPromises();
  expect(store.state.explorer.config?.description).toBe("B.linka");
  expect(store.state.editor.current).toBe("B.linka");
  expect(store.state.editor.temp).toBe("temp-B.linka");
  expect(store.state.editor.pages[0].id).toBe("temp-B.linka");
  expect(settings.element.disabled).toBe(false);
  expect(edit.element.disabled).toBe(false);
  appbar.unmount();
  viewer.unmount();
});

for (const outcome of ["success", "error"] as const) {
  it(`keeps B when an older A load finishes with ${outcome} (real store atomicity)`, async () => {
    const old = deferred<ReturnType<typeof config>>();
    vi.mocked(storageService.getConfigFile).mockImplementation(async (file) => {
      if (file === "A.linka") return old.promise;
      return config("B");
    });
    const wrapper = shallowMount(SetExplorer, {
      global: {
        plugins: [store],
        stubs: {
          VLayout: { template: "<div><slot /></div>" },
          VIcon: true,
          VProgressCircular: true
        }
      }
    });
    route.params.path = "B.linka";
    await flushPromises();
    expect(store.state.explorer.config?.description).toBe("B");
    if (outcome === "success") old.resolve(config("A"));
    else old.reject(new Error("old A unavailable"));
    await flushPromises();
    const actual = store.state.explorer.config?.description;
    wrapper.unmount();
    expect(actual).toBe("B");
  });
}

it("keeps B editor temp/pages when A copyToTemp finishes late (real store atomicity)", async () => {
  const oldCopy = deferred<string>();
  vi.mocked(storageService.copyToTemp).mockImplementation(async (file) =>
    file === "A.linka" ? oldCopy.promise : `temp-${file}`
  );
  vi.mocked(storageService.getConfigFile).mockImplementation(async (file) => config(file));
  const wrapper = shallowMount(SetExplorer, {
    global: {
      plugins: [store],
      stubs: { VLayout: { template: "<div><slot /></div>" }, VIcon: true, VProgressCircular: true }
    }
  });
  await flushPromises();
  route.params.path = "B.linka";
  await flushPromises();
  expect(store.state.editor.current).toBe("B.linka");
  expect(store.state.editor.temp).toBe("temp-B.linka");
  oldCopy.resolve("temp-A.linka");
  await flushPromises();
  const actual = {
    current: store.state.editor.current,
    temp: store.state.editor.temp,
    pageId: store.state.editor.pages?.[0]?.id
  };
  wrapper.unmount();
  expect(actual).toEqual({ current: "B.linka", temp: "temp-B.linka", pageId: "temp-B.linka" });
});
