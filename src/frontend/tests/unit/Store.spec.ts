import chai from "chai";
import { ipcRenderer } from "electron";
import { storageService } from "@/frontend/services/card-storage-service";
import { CardType, CURRENT_SET_VERSION, normalizePage } from "@/common/interfaces/ConfigFile";
import store from "@/frontend/store";

const expect = chai.expect;
const send = ipcRenderer.send as unknown as ReturnType<typeof vi.fn>;
const storage = storageService as unknown as Record<string, ReturnType<typeof vi.fn>>;

vi.mock("@/frontend/services/card-storage-service", () => ({
  storageService: {
    copyToTemp: vi.fn(),
    defaultToTemp: vi.fn(),
    getConfigFile: vi.fn(),
    saveSet: vi.fn()
  }
}));

vi.mock("@/frontend/utils/Metric", () => ({
  Metric: {
    registerEvent: vi.fn()
  }
}));

describe("store", () => {
  beforeEach(() => {
    resetStoreState();
    Object.values(storage).forEach((mock) => mock.mockReset());
    send.mockReset();
  });

  it("updates button timeout and notifies Electron backend", () => {
    store.commit("button_timeout", 2500);

    expect(store.state.button.timeout).to.equal(2500);
    expect(send.mock.calls[0]).to.deep.equal(["button_timeout", 2500]);
  });

  it("toggles output line and gaze lock through actions", async () => {
    await store.dispatch("interface_outputLine");
    await store.dispatch("button_enabled");

    expect(store.state.ui.outputLine).to.equal(false);
    expect(store.state.button.enabled).to.equal(false);
  });

  it("adds unique key bindings and prevents duplicates across sides", async () => {
    store.commit("selectedKey", "down");

    await store.dispatch("keymap_push", { side: "down", code: "KeyS" });
    await store.dispatch("keymap_push", { side: "left", code: "KeyS" });

    expect(store.state.keyMapping.down).to.deep.equal(["ArrowDown", "KeyS"]);
    expect(store.state.keyMapping.left).to.deep.equal(["ArrowLeft"]);
    expect(store.state.selectedKey).to.equal(undefined);
  });

  it("removes key bindings", async () => {
    store.commit("keyMapping_right", ["ArrowRight", "KeyD"]);
    store.commit("selectedKey", "right");

    await store.dispatch("keymap_remove", { side: "right", code: "KeyD" });

    expect(store.state.keyMapping.right).to.deep.equal(["ArrowRight"]);
    expect(store.state.selectedKey).to.equal(undefined);
  });

  it("creates a new editor file and loads normalized config", async () => {
    storage.defaultToTemp.mockResolvedValue("tmp-new.linka");
    storage.getConfigFile.mockResolvedValue({
      version: "2.0",
      columns: 1,
      rows: 1,
      withoutSpace: true,
      cards: [{ id: "card-1", cardType: CardType.AudioCard, title: "one" }]
    });

    await store.dispatch("editor_new_file", "folder§new-set");

    expect(storage.defaultToTemp.mock.calls[0]).to.deep.equal(["folder§new-set.linka"]);
    expect(store.state.editor.current).to.equal("folder§new-set.linka");
    expect(store.state.editor.temp).to.equal("tmp-new.linka");
    expect(store.state.editor.isWithoutSpace).to.equal(true);
    expect(store.state.editor.pages).to.have.length(1);
    expect(store.state.editor.pages[0].cards[0].title).to.equal("one");
  });

  it("opens existing editor file through temp copy", async () => {
    storage.copyToTemp.mockResolvedValue("tmp-copy.linka");
    storage.getConfigFile.mockResolvedValue({
      version: CURRENT_SET_VERSION,
      withoutSpace: false,
      directSet: true,
      quizAutoNext: false,
      quizReadQuestion: true,
      description: "description",
      pages: [{
        id: "page-1",
        mode: "quiz",
        columns: 1,
        rows: 1,
        question: "Question?",
        cards: [{ id: "card-1", cardType: CardType.AudioCard, answer: true }]
      }]
    });

    await store.dispatch("editor_current", "source.linka");

    expect(storage.copyToTemp.mock.calls[0]).to.deep.equal(["source.linka"]);
    expect(store.state.editor.current).to.equal("source.linka");
    expect(store.state.editor.temp).to.equal("tmp-copy.linka");
    expect(store.state.editor.isDirectSet).to.equal(true);
    expect(store.state.editor.quizAutoNext).to.equal(false);
    expect(store.state.editor.quizReadQuestion).to.equal(true);
    expect(store.state.editor.description).to.equal("description");
    expect(store.state.editor.pages[0].question).to.equal("Question?");
  });

  it("saves current editor config", async () => {
    store.commit("editor_current", "current.linka");
    store.commit("editor_temp", "tmp.linka");
    store.commit("editor_description", "description");
    store.commit("editor_isDirectSet", true);
    store.commit("editor_isWithoutSpace", true);
    store.commit("editor_quizAutoNext", false);
    store.commit("editor_quizReadQuestion", true);
    store.commit("editor_pages", [normalizePage({
      id: "page-1",
      mode: "standard",
      columns: 1,
      rows: 1,
      cards: [{ id: "card-1", cardType: CardType.AudioCard, title: "one" }]
    })]);

    await store.dispatch("editor_save");

    expect(storage.saveSet.mock.calls[0][0]).to.equal("tmp.linka");
    expect(storage.saveSet.mock.calls[0][1]).to.equal("current.linka");
    expect(storage.saveSet.mock.calls[0][2]).to.deep.include({
      directSet: true,
      withoutSpace: true,
      quizAutoNext: false,
      quizReadQuestion: true,
      description: "description",
      version: CURRENT_SET_VERSION
    });
    expect(storage.saveSet.mock.calls[0][2].pages[0].cards[0].title).to.equal("one");
  });

  it("saves editor config under a new path", async () => {
    store.commit("editor_current", "folder§old.linka");
    store.commit("editor_temp", "tmp.linka");

    const nextPath = await store.dispatch("editor_save_as", "new.linka");

    expect(nextPath).to.equal("folder§new.linka");
    expect(storage.saveSet.mock.calls[0][1]).to.equal("folder§new.linka");
  });

  it("copies current editor page with renewed ids", async () => {
    store.commit("editor_pages", [normalizePage({
      id: "page-1",
      mode: "standard",
      columns: 1,
      rows: 1,
      cards: [{ id: "card-1", cardType: CardType.AudioCard, title: "one" }]
    })]);

    await store.dispatch("editor_copy_page");

    expect(store.state.editor.pages).to.have.length(2);
    expect(store.state.editor.page).to.equal(1);
    expect(store.state.editor.pages[1].id).to.not.equal("page-1");
    expect(store.state.editor.pages[1].cards[0].id).to.not.equal("card-1");
    expect(store.state.editor.pages[1].cards[0].title).to.equal("one");
  });

  it("resets the only editor page instead of deleting it", async () => {
    store.commit("editor_pages", [normalizePage({
      id: "page-1",
      mode: "match",
      columns: 2,
      rows: 2,
      cards: [{ id: "card-1", cardType: CardType.AudioCard, title: "one" }]
    })]);

    await store.dispatch("editor_delete_page");

    expect(store.state.editor.pages).to.have.length(1);
    expect(store.state.editor.page).to.equal(0);
    expect(store.state.editor.pages[0].mode).to.equal("match");
    expect(store.state.editor.pages[0].columns).to.equal(2);
    expect(store.state.editor.pages[0].rows).to.equal(2);
    expect(store.state.editor.pages[0].cards.every((card) => card.cardType === CardType.NewCard)).to.equal(true);
  });

  it("opens set in explorer and applies directSet output mode", async () => {
    storage.getConfigFile.mockResolvedValue({
      version: CURRENT_SET_VERSION,
      withoutSpace: false,
      directSet: true,
      pages: [{
        id: "page-1",
        mode: "standard",
        columns: 1,
        rows: 1,
        cards: [{ id: "card-1", cardType: CardType.AudioCard }]
      }]
    });

    await store.dispatch("open_file", "set.linka");

    expect(storage.getConfigFile.mock.calls[0]).to.deep.equal(["set.linka"]);
    expect(store.state.explorer.page).to.equal(0);
    expect(store.state.explorer.config?.directSet).to.equal(true);
    expect(store.state.ui.outputLine).to.equal(false);
  });
});

function resetStoreState () {
  store.commit("button_enabled", true);
  store.commit("button_timeout", 1000);
  store.commit("editor_current", "");
  store.commit("editor_temp", "");
  store.commit("editor_description", undefined);
  store.commit("editor_isDirectSet", false);
  store.commit("editor_isWithoutSpace", false);
  store.commit("editor_quizAutoNext", true);
  store.commit("editor_quizReadQuestion", false);
  store.commit("editor_page", 0);
  store.commit("editor_pages", [normalizePage({
    mode: "standard",
    columns: 3,
    rows: 3,
    cards: []
  })]);
  store.commit("explorer_config", undefined);
  store.commit("explorer_page", 0);
  store.commit("interface_outputLine", true);
  store.commit("keyMapping_up", ["ArrowUp"]);
  store.commit("keyMapping_down", ["ArrowDown"]);
  store.commit("keyMapping_left", ["ArrowLeft"]);
  store.commit("keyMapping_right", ["ArrowRight"]);
  store.commit("keyMapping_enter", ["Enter"]);
  store.commit("selectedKey", undefined);
}
