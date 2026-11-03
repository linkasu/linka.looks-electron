import { flushPromises, mount } from "@vue/test-utils";
import { createStore } from "vuex";
import { ref } from "vue";
import EditorAppbar from "@/frontend/views/EditorView.appbar.vue";
import SaveButton from "@/frontend/components/EditorView/SaveButton.vue";
import ExitButton from "@/frontend/components/EditorView/ExitButton.vue";
import { ipcRenderer } from "electron";
import { ICloudStorage } from "@/common/abstract";

const router = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }));
vi.mock("vue-router", () => ({ useRouter: () => router }));

const content = { template: "<div><slot /></div>" };
const stubs = {
  VAppBar: content,
  VAppBarTitle: content,
  VSpacer: true,
  VIcon: true,
  VCard: content,
  VCardTitle: content,
  VCardText: content,
  VCardActions: content,
  VMenu: { template: "<div><slot name='activator' :props='{}' /><slot /></div>" },
  VList: content,
  VListItem: { props: ["disabled"], template: "<button :disabled='disabled'><slot /></button>" },
  VTextField: {
    props: ["modelValue"],
    template:
      "<input :value='modelValue' @input='$emit(\"update:modelValue\", $event.target.value)' />"
  },
  VBtn: { props: ["disabled"], template: "<button :disabled='disabled'><slot /></button>" },
  VDialog: {
    props: ["modelValue"],
    template:
      "<div><slot name='activator' :props='{ onClick: () => $emit(\"update:modelValue\", true) }' /><aside v-if='modelValue'><slot /></aside></div>"
  },
  VSnackbar: { props: ["modelValue"], template: "<aside v-if='modelValue'><slot /></aside>" },
  NotesButton: true,
  SetSettings: true
};

function mountAppbar(save = vi.fn().mockResolvedValue(undefined), dirty = false) {
  const saveAs = vi.fn().mockResolvedValue({ current: "folder§copy.linka", hasChanges: false });
  const hasChanges = ref(dirty);
  const store = createStore({
    state: { ui: { disabled: false }, editor: { current: "folder§set.linka", temp: "temp.linka" } },
    actions: { editor_save: save, editor_save_as: saveAs },
    getters: { editor_hasChanges: () => hasChanges.value }
  });
  const wrapper = mount(EditorAppbar, { global: { plugins: [store], stubs } });
  return { wrapper, store, save, saveAs, hasChanges };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ipcRenderer.invoke).mockResolvedValue("set копия 2.linka");
});

describe("Editor save commands", () => {
  it("saves repeatedly without navigating or changing current/temp paths", async () => {
    const { wrapper, store, save } = mountAppbar();
    const button = wrapper.findAll("button").find((button) => button.text() === "Сохранить")!;
    await button.trigger("click");
    await flushPromises();
    await button.trigger("click");
    await flushPromises();
    expect(save).toHaveBeenCalledTimes(2);
    expect(router.back).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(store.state.editor).toEqual({ current: "folder§set.linka", temp: "temp.linka" });
  });

  it("exits only after the explicit save-and-exit command completes and blocks concurrent commands", async () => {
    let finish!: () => void;
    const { wrapper } = mountAppbar(
      vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          })
      )
    );
    wrapper.getComponent(SaveButton).vm.$emit("saveAndExit");
    await flushPromises();
    expect(router.back).not.toHaveBeenCalled();
    expect(wrapper.getComponent(ExitButton).props("disabled")).toBe(true);
    expect(wrapper.getComponent(SaveButton).props("disabled")).toBe(true);
    finish();
    await flushPromises();
    expect(router.back).toHaveBeenCalledOnce();
  });

  it("reports failure, stays in the editor and allows retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValueOnce(undefined);
    const { wrapper } = mountAppbar(save);
    wrapper.getComponent(SaveButton).vm.$emit("saveAndExit");
    await flushPromises();
    expect(wrapper.text()).toContain("Не удалось сохранить набор");
    expect(router.back).not.toHaveBeenCalled();
    expect(wrapper.getComponent(SaveButton).props("disabled")).toBe(false);
    wrapper.getComponent(SaveButton).vm.$emit("save");
    await flushPromises();
    expect(save).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).not.toContain("Не удалось сохранить набор");
    vi.restoreAllMocks();
  });

  it("offers a separate copy name and navigates using the copied snapshot, not original dirty state", async () => {
    const { wrapper, saveAs } = mountAppbar(undefined, true);
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Сохранить копию")!
      .trigger("click");
    await flushPromises();
    expect(wrapper.get("input").element.value).toBe("set копия 2");
    expect(ICloudStorage.getMethods()).toContain("getSuggestedCopyName");
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      "storage:getSuggestedCopyName",
      "folder§set.linka"
    );
    await wrapper.get("input").setValue("../invalid");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Сохранить копию и выйти")!
      .trigger("click");
    expect(saveAs).not.toHaveBeenCalled();
    await wrapper.get("input").setValue("copy");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Сохранить копию и выйти")!
      .trigger("click");
    await flushPromises();
    expect(saveAs.mock.calls[0][1]).toBe("copy.linka");
    expect(router.push).toHaveBeenCalledWith("/set/folder§copy.linka");
  });

  it("requires confirmation to exit without saving", async () => {
    const wrapper = mount(ExitButton, { global: { stubs } });
    await wrapper.get("[aria-label='Выйти из редактора']").trigger("click");
    expect(wrapper.emitted("exit")).toBeUndefined();
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Продолжить редактирование")!
      .trigger("click");
    expect(wrapper.emitted("exit")).toBeUndefined();
    await wrapper.get("[aria-label='Выйти из редактора']").trigger("click");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Выйти без сохранения")!
      .trigger("click");
    expect(wrapper.emitted("exit")).toHaveLength(1);
  });

  it("does not overwrite a manually entered name when the suggestion arrives", async () => {
    let finish!: (name: string) => void;
    vi.mocked(ipcRenderer.invoke).mockReturnValueOnce(
      new Promise<string>((resolve) => {
        finish = resolve;
      })
    );
    const { wrapper, saveAs } = mountAppbar();
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Сохранить копию")!
      .trigger("click");
    const saveCopy = wrapper
      .findAll("button")
      .find((button) => button.text() === "Сохранить копию и выйти")!;
    expect(saveCopy.attributes("disabled")).toBeDefined();
    await wrapper.get("input").setValue("my copy");
    finish("set копия 2.linka");
    await flushPromises();
    expect(wrapper.get("input").element.value).toBe("my copy");
    await saveCopy.trigger("click");
    await flushPromises();
    expect(saveAs.mock.calls[0][1]).toBe("my copy.linka");
  });

  it("ignores suggestions from a previous set and from a closed dialog", async () => {
    let finish!: (name: string) => void;
    vi.mocked(ipcRenderer.invoke).mockReturnValueOnce(
      new Promise<string>((resolve) => {
        finish = resolve;
      })
    );
    const { wrapper, store } = mountAppbar();
    const open = () =>
      wrapper
        .findAll("button")
        .find((button) => button.text() === "Сохранить копию")!
        .trigger("click");
    await open();
    store.state.editor.current = "another§set.linka";
    await flushPromises();
    finish("old копия.linka");
    await flushPromises();
    expect(wrapper.get("input").element.value).toBe("set копия 2");
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      "storage:getSuggestedCopyName",
      "another§set.linka"
    );
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Продолжить редактирование")!
      .trigger("click");
    vi.mocked(ipcRenderer.invoke).mockReturnValueOnce(
      new Promise<string>((resolve) => {
        finish = resolve;
      })
    );
    await open();
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Продолжить редактирование")!
      .trigger("click");
    finish("closed копия.linka");
    await flushPromises();
    await open();
    await flushPromises();
    expect(wrapper.get("input").element.value).toBe("set копия 2");
  });

  it("reports suggestion errors and retries without saving or changing a manual name", async () => {
    vi.mocked(ipcRenderer.invoke).mockRejectedValueOnce(new Error("unreadable folder"));
    const { wrapper, saveAs } = mountAppbar();
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Сохранить копию")!
      .trigger("click");
    await flushPromises();
    expect(wrapper.get("[role='alert']").text()).toContain("Не удалось предложить имя копии");
    const saveCopy = wrapper
      .findAll("button")
      .find((button) => button.text() === "Сохранить копию и выйти")!;
    expect(saveCopy.attributes("disabled")).toBeDefined();
    expect(saveAs).not.toHaveBeenCalled();
    await wrapper.get("input").setValue("manual");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Повторить")!
      .trigger("click");
    await flushPromises();
    expect(wrapper.find("[role='alert']").exists()).toBe(false);
    expect(wrapper.get("input").element.value).toBe("manual");
    await saveCopy.trigger("click");
    await flushPromises();
    expect(saveAs.mock.calls[0][1]).toBe("manual.linka");
  });

  it("reports a refused copy without navigating, changing paths or clearing original dirty state", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const { wrapper, saveAs, store, hasChanges } = mountAppbar(undefined, true);
    saveAs.mockRejectedValueOnce(new Error("EEXIST"));
    wrapper.getComponent(SaveButton).vm.$emit("saveAs", "set.linka");
    await flushPromises();
    expect(wrapper.text()).toContain("Не удалось сохранить набор");
    expect(router.back).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(hasChanges.value).toBe(true);
    expect(store.state.editor).toEqual({ current: "folder§set.linka", temp: "temp.linka" });
    expect(wrapper.getComponent(SaveButton).props("disabled")).toBe(false);
    errorLog.mockRestore();
  });

  for (const command of ["saveAndExit", "saveAs"] as const) {
    it(`${command} keeps newer edits in the editor with a visible notice`, async () => {
      let finish!: () => void;
      const { wrapper, store, save, saveAs, hasChanges } = mountAppbar();
      const pending = new Promise<unknown>((resolve) => {
        finish = () => resolve({ current: "folder§copy.linka", hasChanges: true });
      });
      (command === "saveAs" ? saveAs : save).mockReturnValueOnce(pending);
      if (command === "saveAs") wrapper.getComponent(SaveButton).vm.$emit(command, "copy.linka");
      else wrapper.getComponent(SaveButton).vm.$emit(command);
      await flushPromises();
      expect(wrapper.getComponent(SaveButton).props("disabled")).toBe(true);
      hasChanges.value = true;
      finish();
      await flushPromises();
      expect(router.back).not.toHaveBeenCalled();
      expect(router.push).not.toHaveBeenCalled();
      expect(wrapper.text()).toContain(
        "Есть новые несохранённые изменения. Сохраните их перед выходом."
      );
      expect(wrapper.getComponent(ExitButton).props("confirm")).toBe(true);
      expect(wrapper.getComponent(SaveButton).props("disabled")).toBe(false);
      expect(store.state.editor).toEqual({ current: "folder§set.linka", temp: "temp.linka" });
    });
  }

  it("exits a clean editor immediately without opening confirmation", async () => {
    const wrapper = mount(ExitButton, { props: { confirm: false }, global: { stubs } });
    await wrapper.get("[aria-label='Выйти из редактора']").trigger("click");
    expect(wrapper.emitted("exit")).toHaveLength(1);
    expect(wrapper.find("aside").exists()).toBe(false);
  });

  it("passes clean and dirty state to exit confirmation", () => {
    for (const dirty of [false, true]) {
      const { wrapper } = mountAppbar(undefined, dirty);
      expect(wrapper.getComponent(ExitButton).props("confirm")).toBe(dirty);
    }
  });

  it("does not exit a disabled clean editor", async () => {
    const wrapper = mount(ExitButton, {
      props: { confirm: false, disabled: true },
      global: { stubs }
    });
    await wrapper.get("[aria-label='Выйти из редактора']").trigger("click");
    expect(wrapper.emitted("exit")).toBeUndefined();
    expect(wrapper.find("aside").exists()).toBe(false);
  });
});
