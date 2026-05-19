import { createStore } from "vuex";

import { LINKaStore, PageTurnMode, Side } from "./LINKaStore";
import { storageService } from "@/frontend/services/card-storage-service";
import { eStore } from "./eStore";
import { ipcRenderer } from "electron";
import { Metric } from "@/frontend/utils/Metric";
import type { ConfigFile, PageMode, SetPage } from "@/common/interfaces/ConfigFile";
import {
  CURRENT_SET_VERSION,
  clonePage,
  createPlaceholderCard,
  normalizeConfigFile,
  normalizePage
} from "@/common/interfaces/ConfigFile";

const fields = [
  { commit: "pcHash", default: "unknow" } as Field<string>,
  { commit: "popupVersion", default: 0 } as Field<number>,
  { commit: "defaultSetsDownloaded", default: 0 } as Field<number>,
  { commit: "colors_primary", default: "#197377" } as Field<string>,
  { commit: "colors_accent", default: "#7DF6FA" } as Field<string>,
  { commit: "colors_secondary", default: "#FFAF00" } as Field<string>,
  { commit: "voiceRu", default: "alena" } as Field<string>,
  { commit: "voiceEn", default: "john" } as Field<string>,
  { commit: "layoutSettings_fontSize", default: 16 } as Field<number>,
  { commit: "layoutSettings_fontBold", default: true } as Field<boolean>,
  { commit: "layoutSettings_isOpened", default: false } as Field<boolean>,
  { commit: "button_timeout", default: 1000 } as Field<number>,
  { commit: "button_eyeSelect", default: true } as Field<boolean>,
  { commit: "button_eyeActivation", default: true } as Field<boolean>,
  { commit: "button_joystickActivation", default: true } as Field<boolean>,
  { commit: "button_keyboardActivation", default: true } as Field<boolean>,
  { commit: "button_mouseActivation", default: true } as Field<boolean>,
  { commit: "button_pageTurnMode", default: "mouseAndEyes" } as Field<PageTurnMode>,
  { commit: "button_borders", default: 1 } as Field<number>,
  { commit: "button_clickSound", default: true } as Field<boolean>,
  { commit: "button_animation", default: true } as Field<boolean>,
  { commit: "button_multiply_scale", default: false } as Field<boolean>,
  { commit: "ui_exitButton", default: true } as Field<boolean>,
  { commit: "keyMapping_up", default: ["ArrowUp"] } as Field<string[]>,
  { commit: "keyMapping_down", default: ["ArrowDown"] } as Field<string[]>,
  { commit: "keyMapping_left", default: ["ArrowLeft"] } as Field<string[]>,
  { commit: "keyMapping_right", default: ["ArrowRight"] } as Field<string[]>,
  { commit: "keyMapping_enter", default: ["Enter"] } as Field<string[]>,
  { commit: "first_calibrate", default: false } as Field<boolean>
];

const store = createStore<LINKaStore>({
  state: {
    popupVersion: 0,
    defaultSetsDownloaded: 0,
    pcHash: "unknow",
    firstCalibrate: false,
    colors: {
      secondary: "",
      accent: "",
      primary: "#197377"
    },
    voiceRu: "alena",
    voiceEn: "john",
    button: {
      timeout: 1000,
      enabled: true,
      eyeSelect: true,
      eyeActivation: true,
      joystickActivation: true,
      keyboardActivation: true,
      mouseActivation: true,
      pageTurnMode: "mouseAndEyes",
      clickSound: true,
      borders: 1,
      animation: true,
      multiplyScale: false
    },
    ui: {
      disabled: false,
      outputLine: true,
      exitButton: true
    },
    selectedKey: undefined,
    keyMapping: {
      up: ["ArrowUp"],
      down: ["ArrowDown"],
      left: ["ArrowLeft"],
      right: ["ArrowRight"],
      enter: ["Enter"]
    },
    editor: {
      current: "",
      temp: "",
      pages: [createEditorPage()],
      page: 0,
      quizAutoNext: true,
      quizReadQuestion: true,
      isDirectSet: false,
      isWithoutSpace: false
    },
    explorer: {
      page: 0,
      config: undefined
    },
    layoutSettings: {
      isOpened: false,
      hasChanges: false,
      fontSize: 16,
      fontBold: true
    }
  },

  mutations: {
    enable_ui (state) {
      state.ui.disabled = false;
    },
    disable_ui (state) {
      state.ui.disabled = true;
    },
    popupVersion (state, value) {
      state.popupVersion = value;
    },
    selectedKey (state, value) {
      state.selectedKey = value;
    },
    defaultSetsDownloaded (state, value) {
      state.defaultSetsDownloaded = value;
    },
    ui_exitButton (state, value) {
      state.ui.exitButton = value;
      Metric.registerEvent(state.pcHash, "settingsToggleEyeExit", { value });
    },
    keyMapping_up ({ keyMapping }, value) {
      keyMapping.up = value;
    },
    keyMapping_down ({ keyMapping }, value) {
      keyMapping.down = value;
    },
    keyMapping_left ({ keyMapping }, value) {
      keyMapping.left = value;
    },
    keyMapping_right ({ keyMapping }, value) {
      keyMapping.right = value;
    },
    keyMapping_enter ({ keyMapping }, value) {
      keyMapping.enter = value;
    },
    colors_primary ({ colors }, value) {
      colors.primary = value;
    },
    colors_accent ({ colors }, value) {
      colors.accent = value;
    },
    colors_secondary ({ colors }, value) {
      colors.secondary = value;
    },
    voiceRu (state, value) {
      state.voiceRu = value;
    },
    voiceEn (state, value) {
      state.voiceEn = value;
    },
    editor_current ({ editor }, value) {
      editor.current = value;
    },
    editor_temp ({ editor }, value) {
      editor.temp = value;
    },
    editor_pages ({ editor }, value: SetPage[]) {
      editor.pages = value;
    },
    editor_isDirectSet ({ editor }, value) {
      editor.isDirectSet = value;
    },
    editor_isWithoutSpace ({ editor }, value) {
      editor.isWithoutSpace = value;
    },
    editor_quizAutoNext ({ editor }, value) {
      editor.quizAutoNext = value;
    },
    editor_quizReadQuestion ({ editor }, value) {
      editor.quizReadQuestion = value;
    },
    editor_description ({ editor }, value) {
      editor.description = value;
    },
    editor_page ({ editor }, value) {
      editor.page = value;
    },
    explorer_page ({ explorer }, value) {
      explorer.page = value;
    },
    explorer_config ({ explorer }, value: ConfigFile | undefined) {
      explorer.config = value;
    },
    layoutSettings_fontBold ({ layoutSettings }, value) {
      layoutSettings.fontBold = value;
    },
    layoutSettings_fontSize ({ layoutSettings }, value) {
      layoutSettings.fontSize = value;
    },
    button_timeout ({ button }, value) {
      ipcRenderer.send("button_timeout", value);
      button.timeout = value;
    },
    button_enabled ({ button, pcHash }, value) {
      button.enabled = value;
      Metric.registerEvent(pcHash, "toggleGazeLock", { value });
    },
    button_eyeSelect ({ button, pcHash }, value) {
      button.eyeSelect = value;
      Metric.registerEvent(pcHash, "settingsToggleEyeChoose", { value });
    },
    button_eyeActivation ({ button, pcHash }, value) {
      button.eyeActivation = value;
      Metric.registerEvent(pcHash, "settingsToggleEyeActivation", { value });
    },
    button_joystickActivation ({ button, pcHash }, value) {
      Metric.registerEvent(pcHash, "settingsToggleJoystickActivation", { value });
      button.joystickActivation = value;
    },
    button_keyboardActivation ({ button, pcHash }, value) {
      Metric.registerEvent(pcHash, "settingsToggleKeyboardActivation", { value });
      button.keyboardActivation = value;
    },
    button_mouseActivation ({ button }, value) {
      button.mouseActivation = value;
    },
    button_pageTurnMode ({ button }, value: PageTurnMode) {
      button.pageTurnMode = value;
    },
    button_borders ({ button }, value) {
      button.borders = value;
    },
    button_animation ({ button }, value) {
      button.animation = value;
    },
    button_clickSound ({ button, pcHash }, value) {
      button.clickSound = value;
      Metric.registerEvent(pcHash, "settingsToggleTypeSound", { value });
    },
    button_multiply_scale ({ button }, value) {
      button.multiplyScale = value;
      ipcRenderer.send("button_multiply_scale", value);
    },
    layoutSettings_isOpened ({ layoutSettings }, value) {
      layoutSettings.isOpened = value;
    },
    interface_outputLine ({ ui, pcHash }, value) {
      ui.outputLine = value;
      Metric.registerEvent(pcHash, "toggleOutputLine", value);
    },
    pcHash (state, hash) {
      state.pcHash = hash;
    },
    first_calibrate (state, value) {
      state.firstCalibrate = value;
    }
  },

  actions: {
    enable_ui ({ commit }) {
      commit("enable_ui");
    },
    disable_ui ({ commit }) {
      commit("disable_ui");
    },
    keymap_push ({ state, commit }, { side, code }: { side: Side, code: string }) {
      if (!Object.values(state.keyMapping).find((sides) => sides.includes(code))) {
        state.keyMapping[side].push(code);
      }
      commit("keyMapping_" + side, state.keyMapping[side]);
      state.selectedKey = undefined;
    },
    keymap_remove ({ state, commit }, { side, code }: { side: Side, code: string }) {
      commit("keyMapping_" + side, state.keyMapping[side].filter((c) => c !== code));
      state.selectedKey = undefined;
    },
    voiceRu_change ({ commit }, voice: string) {
      commit("voiceRu", voice);
    },
    voiceEn_change ({ commit }, voice: string) {
      commit("voiceEn", voice);
    },
    voice_change ({ commit }, voice: string) {
      commit("voiceRu", voice);
    },

    interface_outputLine ({ state, commit }) {
      commit("interface_outputLine", !state.ui.outputLine);
    },

    button_enabled ({ state, commit }) {
      commit("button_enabled", !state.button.enabled);
    },

    button_animation_toggle ({ state, commit }) {
      commit("button_animation", !state.button.animation);
    },

    fontBold_toggle ({ state, commit }) {
      commit("layoutSettings_fontBold", !state.layoutSettings.fontBold);
    },

    fontSize_change ({ commit }, size: number) {
      commit("layoutSettings_fontSize", size);
    },

    toggle_settings_opened ({ state, commit }) {
      commit("layoutSettings_isOpened", !state.layoutSettings.isOpened);
    },

    async editor_new_file ({ state, dispatch }, file: string) {
      file += ".linka";
      state.editor.current = file;
      state.editor.temp = await storageService.defaultToTemp(file);
      await dispatch("editor_load_set");
    },

    async editor_current ({ state, dispatch }, file: string) {
      state.editor.current = file;
      state.editor.temp = await storageService.copyToTemp(file);
      await dispatch("editor_load_set");
    },

    editor_current_default ({ commit }) {
      commit("editor_current", "");
      commit("editor_temp", "");
      commit("editor_pages", [createEditorPage()]);
      commit("editor_page", 0);
    },

    async editor_load_set ({ state, commit }) {
      const config = await storageService.getConfigFile(state.editor.temp);
      const normalized = normalizeConfigFile(config);
      if (!normalized) return;

      commit("editor_pages", normalized.pages ?? [createEditorPage()]);
      commit("editor_description", normalized.description);
      commit("editor_isWithoutSpace", !!normalized.withoutSpace);
      commit("editor_isDirectSet", !!normalized.directSet);
      commit("editor_quizAutoNext", normalized.quizAutoNext ?? true);
      commit("editor_quizReadQuestion", normalized.quizReadQuestion ?? false);
      commit("editor_page", 0);
    },

    async editor_save ({ state }) {
      await storageService.saveSet(state.editor.temp, state.editor.current, buildEditorConfig(state));
    },

    async editor_save_as ({ state }, title) {
      const parts = state.editor.current.split("§");
      parts[parts.length - 1] = title;
      const current = parts.join("§");
      await storageService.saveSet(state.editor.temp, current, buildEditorConfig(state));
      return current;
    },

    editor_copy_page ({ state, commit }) {
      const pages = [...(state.editor.pages ?? [])];
      const pageIndex = clampPageIndex(state.editor.page, pages.length);
      const currentPage = pages[pageIndex] ?? createEditorPage();
      const nextPage = clonePage(currentPage, true);
      pages.splice(pageIndex + 1, 0, nextPage);
      commit("editor_pages", pages);
      commit("editor_page", pageIndex + 1);
    },

    editor_delete_page ({ state, commit }) {
      const pages = [...(state.editor.pages ?? [])];
      const pageIndex = clampPageIndex(state.editor.page, pages.length);
      const currentPage = pages[pageIndex] ?? createEditorPage();

      if (pages.length <= 1) {
        pages.splice(0, pages.length, createEditorPage(currentPage.mode, currentPage.columns, currentPage.rows));
        commit("editor_pages", pages);
        commit("editor_page", 0);
        return;
      }

      pages.splice(pageIndex, 1);
      commit("editor_pages", pages);
      commit("editor_page", Math.max(0, Math.min(pageIndex, pages.length - 1)));
    },

    async open_file ({ commit }, filename) {
      const config = normalizeConfigFile(await storageService.getConfigFile(filename));
      if (!config) return;

      commit("explorer_config", config);
      commit("explorer_page", 0);
      commit("interface_outputLine", !config.directSet);
    }
  },
  plugins: [
    (currentStore) => {
      currentStore.subscribe((mutation) => {
        if (!fields.find(({ commit }) => mutation.type === commit)) return;
        eStore.set(mutation.type, mutation.payload);
      });
    }
  ]
});

export default store;

for (const field of fields) {
  store.commit(field.commit, eStore.get(field.commit, field.default));
}

if (!eStore.has("voiceRu")) {
  store.commit("voiceRu", eStore.get("voice", "alena"));
}
if (!eStore.has("voiceEn")) {
  store.commit("voiceEn", "john");
}

interface Field<T> {
  commit: string;
  default: T;
}

function createEditorPage (mode: PageMode = "standard", columns = 3, rows = 3): SetPage {
  const normalizedRows = mode === "match" ? 2 : rows;
  return normalizePage({
    mode,
    columns,
    rows: normalizedRows,
    cards: [createPlaceholderCard()]
  });
}

function buildEditorConfig (state: LINKaStore): ConfigFile {
  return {
    pages: (state.editor.pages ?? []).map((page) => normalizePage(page)),
    directSet: state.editor.isDirectSet,
    withoutSpace: state.editor.isWithoutSpace,
    quizAutoNext: state.editor.quizAutoNext,
    quizReadQuestion: state.editor.quizReadQuestion,
    description: state.editor.description,
    version: CURRENT_SET_VERSION
  };
}

function clampPageIndex (page: number, length: number): number {
  if (!length) return 0;
  return Math.max(0, Math.min(length - 1, page ?? 0));
}
