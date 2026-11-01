import { flushPromises, mount } from "@vue/test-utils";
import { createStore } from "vuex";
import EditorView from "@/frontend/views/EditorView.vue";

vi.mock("vue-router", () => ({ useRoute: () => ({ params: { path: "test.linka" } }) }));
vi.mock("@/frontend/utils/Telemetry", () => ({ Telemetry: { product: vi.fn() } }));

function mountEditor() {
  const deletePage = vi.fn();
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
    actions: { editor_current: vi.fn(), editor_delete_page: deletePage }
  });
  const content = { template: "<div><slot /></div>" };
  const wrapper = mount(EditorView, {
    global: {
      plugins: [store],
      stubs: {
        NewFileDialog: true,
        CreateFromTextDialog: true,
        PictureBankDialog: true,
        TTSDialog: true,
        SetGridButton: { template: "<button data-testid='editor-card' />" },
        draggable: {
          props: ["modelValue"],
          template: `<div><slot v-for="(element, index) in modelValue" name="item" :element="element" :index="index" /></div>`
        },
        VDialog: { props: ["modelValue"], template: "<aside v-if='modelValue'><slot /></aside>" },
        VSnackbar: true,
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
  return { wrapper, store, deletePage };
}

describe("Editor destructive actions", () => {
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
