import { flushPromises, mount } from "@vue/test-utils";
import { createStore } from "vuex";
import EditorAppbar from "@/frontend/views/EditorView.appbar.vue";
import SaveButton from "@/frontend/components/EditorView/SaveButton.vue";
import ExitButton from "@/frontend/components/EditorView/ExitButton.vue";

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

function mountAppbar(save = vi.fn().mockResolvedValue(undefined)) {
  const saveAs = vi.fn().mockResolvedValue("folder§copy.linka");
  const store = createStore({
    state: { ui: { disabled: false }, editor: { current: "folder§set.linka", temp: "temp.linka" } },
    actions: { editor_save: save, editor_save_as: saveAs }
  });
  const wrapper = mount(EditorAppbar, { global: { plugins: [store], stubs } });
  return { wrapper, store, save, saveAs };
}

beforeEach(() => vi.clearAllMocks());

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

  it("validates copy names and preserves the existing copy-and-exit contract", async () => {
    const { wrapper, saveAs } = mountAppbar();
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Сохранить копию")!
      .trigger("click");
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
});
