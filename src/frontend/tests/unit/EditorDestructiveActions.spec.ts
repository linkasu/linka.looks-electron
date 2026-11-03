import { flushPromises, mount } from "@vue/test-utils";
import { createStore } from "vuex";
import EditorView from "@/frontend/views/EditorView.vue";
import { storageService } from "@/frontend/services/card-storage-service";

vi.mock("vue-router", () => ({ useRoute: () => ({ params: { path: "test.linka" } }) }));
vi.mock("@/frontend/utils/Telemetry", () => ({ Telemetry: { product: vi.fn() } }));
vi.mock("@/frontend/services/card-storage-service", () => ({
  storageService: { createImageFromText: vi.fn() }
}));

function mountEditor(textDialog = false) {
  const deletePage = vi.fn();
  const copyPage = vi.fn();
  const store = createStore({
    state: {
      ui: { disabled: false },
      editor: {
        temp: "test.linka",
        page: 0,
        pages: [
          {
            mode: "standard",
            rows: 1,
            columns: 1,
            cards: [
              {
                id: "card",
                cardType: 0,
                title: "Привет",
                imagePath: "image.png"
              }
            ]
          }
        ]
      }
    },
    mutations: {
      editor_pages(state, pages) {
        state.editor.pages = pages;
      },
      editor_page(state, page) {
        state.editor.page = page;
      }
    },
    actions: {
      editor_current: vi.fn(),
      editor_delete_page: deletePage,
      editor_copy_page: copyPage,
      disable_ui: ({ state }) => {
        state.ui.disabled = true;
      },
      enable_ui: ({ state }) => {
        state.ui.disabled = false;
      }
    }
  });
  const content = { template: "<div><slot /></div>" };
  const wrapper = mount(EditorView, {
    global: {
      plugins: [store],
      stubs: {
        NewFileDialog: true,
        CreateFromTextDialog: !textDialog,
        InputDialog: {
          emits: ["confirm"],
          template: `<button class="generate-text" @click="$emit('confirm', ' Кот ')">Создать</button>`
        },
        PictureBankDialog: true,
        TTSDialog: true,
        SetGridButton: {
          template: "<button data-testid='editor-card'><div class='cardContainer' /></button>"
        },
        draggable: {
          props: ["modelValue"],
          template: `<div><slot v-for="(element, index) in modelValue" name="item" :element="element" :index="index" /></div>`
        },
        VDialog: { props: ["modelValue"], template: "<aside v-if='modelValue'><slot /></aside>" },
        VSnackbar: {
          props: ["modelValue"],
          template: "<div v-if='modelValue'><slot /><slot name='actions' /></div>"
        },
        VBtn: { props: ["disabled"], template: "<button :disabled='disabled'><slot /></button>" },
        VCard: content,
        VCardTitle: content,
        VCardText: content,
        VCardActions: content,
        VRow: content,
        VCol: content,
        VForm: content,
        VContainer: content,
        VCardSubtitle: content,
        VTextField: true,
        VSelect: true,
        VIcon: true,
        VSpacer: true,
        VCheckbox: true
      }
    }
  });
  return { wrapper, store, deletePage, copyPage };
}

describe("Editor destructive actions", () => {
  beforeEach(() =>
    vi.mocked(storageService.createImageFromText).mockReset().mockResolvedValue("generated.png")
  );
  afterEach(() => vi.restoreAllMocks());

  it("copies a card into a free slot and selects the independent copy", async () => {
    const { wrapper, store } = mountEditor();
    store.commit("editor_pages", [
      {
        ...store.state.editor.pages[0],
        columns: 2,
        cards: [store.state.editor.pages[0].cards[0], { id: "free", cardType: 3 }]
      }
    ]);
    await flushPromises();
    await wrapper.findAll("[data-testid='editor-card']")[0].trigger("click");
    await wrapper.get("[aria-label='Копировать карточку']").trigger("click");
    const cards = store.state.editor.pages[0].cards;
    expect(cards).toHaveLength(2);
    expect(cards[1]).toMatchObject({ title: "Привет", imagePath: "image.png" });
    expect(cards[1].id).not.toBe(cards[0].id);
    expect(wrapper.findAll("[data-testid='editor-card']")[1].attributes("aria-pressed")).toBe(
      "true"
    );
  });

  it("dispatches page copying and clears the previous card selection", async () => {
    const { wrapper, copyPage } = mountEditor();
    await flushPromises();
    await wrapper.get("[data-testid='editor-card']").trigger("click");
    await wrapper.get("[aria-label='Копировать страницу']").trigger("click");
    expect(copyPage).toHaveBeenCalledOnce();
    expect(wrapper.get("[data-testid='editor-card']").attributes("aria-pressed")).toBe("false");
  });

  it("merges a free slot, refuses covered selection and resets the size", async () => {
    const { wrapper, store } = mountEditor();
    store.commit("editor_pages", [
      {
        ...store.state.editor.pages[0],
        columns: 2,
        cards: [store.state.editor.pages[0].cards[0], { id: "free", cardType: 3 }]
      }
    ]);
    await flushPromises();
    await wrapper.findAll("[data-testid='editor-card']")[0].trigger("click");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "+ вправо")!
      .trigger("click");
    expect(store.state.editor.pages[0].cards[0]).toMatchObject({ width: 2 });
    expect(wrapper.get("summary").text()).toContain("2×1");
    await wrapper.findAll("[data-testid='editor-card']")[1].trigger("click");
    expect(wrapper.findAll("[data-testid='editor-card']")[0].attributes("aria-pressed")).toBe(
      "true"
    );
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Сбросить до 1×1")!
      .trigger("click");
    expect(wrapper.get("summary").text()).toContain("1×1");
    expect(store.state.editor.pages[0].cards[0].title).toBe("Привет");
  });

  it("uses the selected merged card's rendered proportions for text images", async () => {
    const { wrapper, store } = mountEditor(true);
    store.commit("editor_pages", [
      {
        ...store.state.editor.pages[0],
        columns: 3,
        cards: [{ ...store.state.editor.pages[0].cards[0], width: 3 }]
      }
    ]);
    await flushPromises();
    await wrapper.get("[data-testid='editor-card']").trigger("click");
    vi.spyOn(
      wrapper.get(".selected .cardContainer").element,
      "getBoundingClientRect"
    ).mockReturnValue(new DOMRect(0, 0, 900, 300));
    await wrapper.get(".generate-text").trigger("click");
    await flushPromises();
    expect(storageService.createImageFromText).toHaveBeenCalledWith("test.linka", "Кот", {
      width: 900,
      height: 300
    });
    expect(store.state.editor.pages[0].cards[0].imagePath).toBe("generated.png");
  });

  it("drops a failed text-image retry when another card is selected", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(storageService.createImageFromText).mockRejectedValueOnce(new Error("Ошибка PNG"));
    const { wrapper, store } = mountEditor(true);
    store.state.editor.pages[0].columns = 2;
    store.state.editor.pages[0].cards.push({
      id: "other",
      cardType: 0,
      title: "Другая",
      imagePath: "other.png"
    });
    await flushPromises();
    await wrapper.findAll("[data-testid='editor-card']")[0].trigger("click");
    await wrapper.get(".generate-text").trigger("click");
    await flushPromises();
    expect(wrapper.find(".retry").exists()).toBe(true);
    await wrapper.findAll("[data-testid='editor-card']")[1].trigger("click");
    expect(wrapper.find(".retry").exists()).toBe(false);
    expect(store.state.editor.pages[0].cards[1].imagePath).toBe("other.png");
  });

  it("does not apply a pending text image to a newly selected card", async () => {
    let finish!: (image: string) => void;
    vi.mocked(storageService.createImageFromText).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const { wrapper, store } = mountEditor(true);
    store.state.editor.pages[0].columns = 2;
    store.state.editor.pages[0].cards.push({
      id: "other",
      cardType: 0,
      title: "Другая",
      imagePath: "other.png"
    });
    await flushPromises();
    await wrapper.findAll("[data-testid='editor-card']")[0].trigger("click");
    await wrapper.get(".generate-text").trigger("click");
    await wrapper.findAll("[data-testid='editor-card']")[1].trigger("click");
    finish("generated.png");
    await flushPromises();
    expect(store.state.editor.pages[0].cards[1].imagePath).toBe("other.png");
    expect(store.state.ui.disabled).toBe(false);
  });

  it("navigates existing empty pages without creating pages; adds only with the explicit command", async () => {
    const { wrapper, store } = mountEditor();
    store.commit("editor_pages", [
      { mode: "match", rows: 2, columns: 2, topColumns: 2, bottomColumns: 1, cards: [] },
      { mode: "match", rows: 2, columns: 2, topColumns: 2, bottomColumns: 1, cards: [] }
    ]);
    await flushPromises();
    const next = wrapper.get("[aria-label='Следующая страница']");
    expect(next.attributes("disabled")).toBeUndefined();
    await next.trigger("click");
    expect(store.state.editor.page).toBe(1);
    expect(store.state.editor.pages).toHaveLength(2);
    expect(next.attributes("disabled")).toBeDefined();
    await wrapper.get("[aria-label='Предыдущая страница']").trigger("click");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "+ Страница")!
      .trigger("click");
    expect(store.state.editor.pages).toHaveLength(3);
    expect(store.state.editor.page).toBe(2);
    expect(store.state.editor.pages[2]).toMatchObject({
      mode: "match",
      rows: 2,
      topColumns: 2,
      bottomColumns: 1
    });
  });

  it("keeps size controls collapsed after title, image and audio controls", async () => {
    const { wrapper } = mountEditor();
    await flushPromises();
    await wrapper.get("[data-testid='editor-card']").trigger("click");
    expect(wrapper.get("details").attributes("open")).toBeUndefined();
    expect(wrapper.get("summary").text()).toContain("Размер карточки");
    const html = wrapper.html();
    expect(html.indexOf('label="Название карточки"')).toBeLessThan(html.indexOf("Изображение"));
    expect(html.indexOf("Изображение")).toBeLessThan(html.indexOf("Озвучка"));
    expect(html.indexOf("Озвучка")).toBeLessThan(html.indexOf("<details"));
    expect(wrapper.get("[data-testid='editor-card']").attributes("aria-pressed")).toBe("true");
  });

  it("requires confirmation before deleting a page", async () => {
    const { wrapper, deletePage } = mountEditor();
    await wrapper.get("[aria-label='Удалить страницу']").trigger("click");
    expect(deletePage).not.toHaveBeenCalled();
    await wrapper.get("aside button").trigger("click");
    expect(deletePage).not.toHaveBeenCalled();
    await wrapper.get("[aria-label='Удалить страницу']").trigger("click");
    await wrapper.findAll("aside button")[1].trigger("click");
    expect(deletePage).toHaveBeenCalledOnce();
  });

  it("keeps card contents until reset is confirmed", async () => {
    const { wrapper, store } = mountEditor();
    await flushPromises();
    await wrapper.get("[data-testid='editor-card']").trigger("click");
    await wrapper.get("[aria-label='Сбросить карточку']").trigger("click");
    expect(store.state.editor.pages[0].cards[0].title).toBe("Привет");
    await wrapper.get("aside button").trigger("click");
    expect(store.state.editor.pages[0].cards[0].title).toBe("Привет");
    await wrapper.get("[aria-label='Сбросить карточку']").trigger("click");
    await wrapper.findAll("aside button")[1].trigger("click");
    expect(store.state.editor.pages[0].cards[0].cardType).toBe(3);
  });
});
