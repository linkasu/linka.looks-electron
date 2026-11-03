import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import PictureBankDialog from "@/frontend/components/EditorView/PictureBank/PictureBankDialog.vue";

const api = vi.hoisted(() => ({
  categories: vi.fn(),
  search: vi.fn(),
  byCategory: vi.fn(),
  download: vi.fn()
}));

vi.mock("pictures.bank-api", () => ({
  PictureBankApi: class {
    categories = { getCategories: api.categories };
    pictures = { searchPictures: api.search, getPicturesByCategory: api.byCategory };
  }
}));

vi.mock("@/frontend/services/card-storage-service", () => ({
  storageService: { downloadImageFromBank: api.download }
}));

function mountBank() {
  return mount(PictureBankDialog, {
    props: { file: "test.linka" },
    global: {
      stubs: {
        VIcon: true,
        VCard: { template: "<article><slot /></article>" },
        VCardTitle: { template: "<h2><slot /></h2>" },
        VCardText: { template: "<div><slot /></div>" },
        VCardActions: { template: "<div><slot /></div>" },
        VRow: { template: "<div><slot /></div>" },
        VCol: { template: "<div><slot /></div>" },
        VSelect: true,
        VImg: true,
        VSpacer: true,
        VProgressLinear: true,
        VAlert: { template: "<div role='alert'><slot /></div>" },
        VDialog: { template: "<div><slot name='activator' /><slot /></div>" },
        VBtn: { template: "<button><slot /></button>" },
        VTextField: defineComponent({
          props: ["modelValue"],
          emits: ["update:modelValue"],
          template: `<input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`
        })
      }
    }
  });
}

describe("Editor picture bank", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.categories.mockResolvedValue([]);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it("reports category loading errors and allows retrying", async () => {
    api.categories.mockRejectedValueOnce(new Error("offline"));
    api.categories.mockResolvedValueOnce([{ id: "animals", name: "Животные" }]);
    const wrapper = mountBank();
    await wrapper.get("button").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Не удалось загрузить категории");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Повторить загрузку категорий")!
      .trigger("click");
    await flushPromises();
    expect(api.categories).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).not.toContain("Не удалось загрузить категории");
  });

  it("shows category loading and disables the category selector until completion", async () => {
    let finish!: (categories: { id: string; name: string }[]) => void;
    api.categories.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const wrapper = mountBank();
    await wrapper.get("button").trigger("click");
    expect(wrapper.get("[aria-live='polite']").attributes("aria-busy")).toBe("true");
    expect(wrapper.findComponent({ name: "VSelect" }).attributes("disabled")).toBe("true");
    finish([{ id: "animals", name: "Животные" }]);
    await flushPromises();
    expect(api.categories).toHaveBeenCalledOnce();
    expect(wrapper.get("[aria-live='polite']").attributes("aria-busy")).toBe("false");
  });

  it("trims search and makes search and category filters mutually exclusive", async () => {
    api.search.mockResolvedValue([]);
    api.byCategory.mockResolvedValue([]);
    const wrapper = mountBank();
    const select = wrapper.findComponent({ name: "VSelect" });
    await select.vm.$emit("update:modelValue", "animals");
    await flushPromises();
    expect(api.byCategory).toHaveBeenLastCalledWith("animals");
    await wrapper.get("input").setValue("  кот  ");
    await flushPromises();
    expect(api.search).toHaveBeenLastCalledWith("кот");
    expect(select.attributes("modelvalue")).toBeUndefined();
    await select.vm.$emit("update:modelValue", "animals");
    await flushPromises();
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe("");
    expect(api.byCategory).toHaveBeenCalledTimes(2);
    await wrapper.get("input").setValue("  \t ");
    await flushPromises();
    expect(api.search).toHaveBeenCalledTimes(1);
  });

  it("ignores a stale search rejection after the next search succeeds", async () => {
    let fail!: (error: Error) => void;
    api.search.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        })
    );
    api.search.mockResolvedValueOnce([{ id: "cat", name: "Кот" }]);
    const wrapper = mountBank();
    await wrapper.get("input").setValue("старый");
    await wrapper.get("input").setValue("кот");
    await flushPromises();
    fail(new Error("old offline"));
    await flushPromises();
    expect(wrapper.text()).toContain("Кот");
    expect(wrapper.text()).not.toContain("Не удалось загрузить картинки");
    expect(wrapper.get("[aria-live='polite']").attributes("aria-busy")).toBe("false");
  });

  it("locks controls while inserting and emits one successful image and name", async () => {
    let finish!: (image: string) => void;
    api.search.mockResolvedValue([{ id: "cat", name: "Кот" }]);
    api.download.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const wrapper = mountBank();
    await wrapper.get("input").setValue("кот");
    await flushPromises();
    const insert = wrapper.get("[aria-label='Вставить картинку: Кот']");
    await insert.trigger("click");
    expect(insert.attributes("disabled")).toBeDefined();
    expect(wrapper.get("input").attributes("disabled")).toBeDefined();
    await insert.trigger("click");
    expect(api.download).toHaveBeenCalledTimes(1);
    expect(api.download).toHaveBeenCalledWith("test.linka", "cat");
    finish("cat.png");
    await flushPromises();
    expect(wrapper.emitted("image")).toEqual([["cat.png"]]);
    expect(wrapper.emitted("name")).toEqual([["Кот"]]);
    expect(wrapper.get("input").attributes("disabled")).toBeUndefined();
  });

  it("ignores stale search responses and clears results for an empty query", async () => {
    let resolveFirst!: (pictures: { id: string; name: string }[]) => void;
    api.search.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );
    api.search.mockResolvedValueOnce([{ id: "new", name: "Новый результат" }]);
    const wrapper = mountBank();
    await wrapper.get("input").setValue("старый");
    await wrapper.get("input").setValue("новый");
    await flushPromises();
    resolveFirst([{ id: "old", name: "Старый результат" }]);
    await flushPromises();
    expect(wrapper.text()).toContain("Новый результат");
    expect(wrapper.text()).not.toContain("Старый результат");
    await wrapper.get("input").setValue("");
    expect(wrapper.text()).not.toContain("Новый результат");
    expect(wrapper.text()).toContain("Введите название или выберите категорию");
  });

  it("preserves category retry when searching after a category failure", async () => {
    api.categories.mockRejectedValueOnce(new Error("categories offline"));
    api.search.mockResolvedValueOnce([]);
    const wrapper = mountBank();
    await wrapper.get("button").trigger("click");
    await flushPromises();
    await wrapper.get("input").setValue("кот");
    await flushPromises();
    expect(wrapper.text()).toContain("Не удалось загрузить категории");
    expect(wrapper.text()).toContain("Повторить загрузку категорий");
  });

  it("preserves a search failure when retrying category loading", async () => {
    api.categories.mockRejectedValueOnce(new Error("categories offline"));
    api.categories.mockResolvedValueOnce([{ id: "animals", name: "Животные" }]);
    api.search.mockRejectedValueOnce(new Error("search offline"));
    const wrapper = mountBank();
    await wrapper.get("button").trigger("click");
    await flushPromises();
    await wrapper.get("input").setValue("кот");
    await flushPromises();
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Повторить загрузку категорий")!
      .trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Не удалось загрузить картинки");
    expect(wrapper.text()).not.toContain("Не удалось загрузить категории");
  });

  it("reports a failed search and recovers with an empty state", async () => {
    api.search.mockRejectedValueOnce(new Error("offline"));
    api.search.mockResolvedValueOnce([]);
    const wrapper = mountBank();
    await wrapper.get("input").setValue("дом");
    await flushPromises();
    expect(wrapper.text()).toContain("Не удалось загрузить картинки");
    await wrapper.get("input").setValue("кот");
    await flushPromises();
    expect(wrapper.text()).toContain("Картинки не найдены");
    expect(wrapper.text()).not.toContain("Не удалось загрузить картинки");
  });

  it("keeps the dialog open and emits nothing when downloading fails", async () => {
    api.search.mockResolvedValue([{ id: "cat", name: "Кот" }]);
    api.download.mockRejectedValue(new Error("offline"));
    const wrapper = mountBank();
    await wrapper.get("input").setValue("кот");
    await flushPromises();
    await wrapper.get("[aria-label='Вставить картинку: Кот']").trigger("click");
    await flushPromises();
    expect(wrapper.emitted("image")).toBeUndefined();
    expect(wrapper.emitted("name")).toBeUndefined();
    expect(wrapper.text()).toContain("Не удалось добавить картинку");
    expect(
      wrapper.get("[aria-label='Вставить картинку: Кот']").attributes("disabled")
    ).toBeUndefined();
    api.download.mockResolvedValueOnce("cat.png");
    await wrapper.get("[aria-label='Вставить картинку: Кот']").trigger("click");
    await flushPromises();
    expect(wrapper.emitted("image")).toEqual([["cat.png"]]);
    expect(wrapper.text()).not.toContain("Не удалось добавить картинку");
  });
});
