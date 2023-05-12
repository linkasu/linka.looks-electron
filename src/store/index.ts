import { createStore, } from 'vuex'

import { LINKaStore, Side } from './LINKaStore'
import { storageService } from '@/CardsStorage/frontend'
import { eStore } from './eStore'


const fields = [
  { commit: 'colors_primary', default: '#197377' } as Field<string>,
  { commit: 'colors_accent', default: '#7DF6FA' } as Field<string>,
  { commit: 'colors_secondary', default: '#AD9F4E' } as Field<string>,
  { commit: 'button_timeout', default: 1000 } as Field<number>,
  { commit: 'button_eyeSelect', default: true } as Field<boolean>,
  { commit: 'button_eyeActivation', default: true } as Field<boolean>,
  { commit: 'button_joystickActivation', default: true } as Field<boolean>,
  { commit: 'button_keyboardActivation', default: true } as Field<boolean>,
  { commit: 'button_mouseActivation', default: true } as Field<boolean>,
  { commit: 'button_borders', default: 1 } as Field<number>,
  { commit: 'button_enabled', default: true } as Field<boolean>,
  { commit: 'button_clickSound', default: true } as Field<boolean>,
  { commit: 'ui_exitButton', default: true } as Field<boolean>,
  { commit: 'keyMapping_up', default: ['ArrowUp'] } as Field<string[]>,
  { commit: 'keyMapping_down', default: ['ArrowDown'] } as Field<string[]>,
  { commit: 'keyMapping_left', default: ['ArrowLeft'] } as Field<string[]>,
  { commit: 'keyMapping_right', default: ['ArrowRight'] } as Field<string[]>,
  { commit: 'keyMapping_enter', default: ['Enter'] } as Field<string[]>,
]

const store = createStore<LINKaStore>({
  state: {
    colors: {
      secondary: '',
      accent: '',
      primary: '#197377'
    },
    button: {
      timeout: 1000,
      enabled: true,
      eyeSelect: true,
      eyeActivation: true,
      joystickActivation: true,
      keyboardActivation: true,
      mouseActivation: true,
      clickSound: true,
      borders: 1
    },
    ui: {
      outputLine: true,
      exitButton: true
    },
    selectedKey: undefined,
    keyMapping: {
      up: ['ArrowUp'],
      down: ['ArrowDown'],
      left: ['ArrowLeft'],
      right: ['ArrowRight'],
      enter: ['Enter']
    },
    editor: {
      current: '',
      temp: '',
      cards: [],
      quiz: false,
      questions: [],
      quizAutoNext: true,
      quizReadQuestion: true,
      columns: 3,
      rows: 3,
      isDirectSet: false, isWithoutSpace: false
    },
    explorer: {

    }
  },
  mutations: {
    selectedKey(state, value) {
      state.selectedKey = value
    },
    ui_exitButton(state, value) {
      state.ui.exitButton = value
    },
    keyMapping_up({ keyMapping: keyMapping }, value) {

      keyMapping.up = value
    },
    keyMapping_down({ keyMapping: keyMapping }, value) {

      keyMapping.down = value
    },
    keyMapping_left({ keyMapping: keyMapping }, value) {

      keyMapping.left = value
    },
    keyMapping_right({ keyMapping: keyMapping }, value) {

      keyMapping.right = value
    },
    keyMapping_enter({ keyMapping: keyMapping }, value) {

      keyMapping.enter = value
    },
    colors_primary({ colors }, value) {

      colors.primary = value
    },
    colors_accent({ colors }, value) {

      colors.accent = value
    },
    colors_secondary({ colors }, value) {

      colors.secondary = value
    },
    editor_current({ editor }, value) {
      editor.current = value
    },
    editor_temp({ editor }, value) {
      editor.temp = value
    },
    editor_cards({ editor }, value) {
      editor.cards = value
    },
    editor_columns({ editor }, value) {
      editor.columns = value
    },
    editor_rows({ editor }, value) {
      editor.rows = value
    },
    editor_isDirectSet({ editor }, value) {
      editor.isDirectSet = value
    },
    editor_isWithoutSpace({ editor }, value) {
      editor.isWithoutSpace = value
    },
    editor_isQuiz({ editor }, value) {
      editor.quiz = value
    },
    editor_questions({ editor }, value) {
      editor.questions = value
    },
    editor_quizAutoNext({ editor }, value) {
      editor.quizAutoNext = value
    },
    editor_quizReadQuestion({ editor }, value) {
      editor.quizReadQuestion = value
    },
    editor_description({ editor }, value) {
      editor.description = value
    },
    button_timeout({ button }, value) {

      button.timeout = value
    },
    button_enabled({ button }, value) {
      button.enabled = value
    },
    button_eyeSelect({ button }, value) {

      button.eyeSelect = value
    },
    button_eyeActivation({ button }, value) {

      button.eyeActivation = value
    },
    button_joystickActivation({ button }, value) {

      button.joystickActivation = value
    },
    button_keyboardActivation({ button }, value) {

      button.keyboardActivation = value
    },
    button_mouseActivation({ button }, value) {

      button.mouseActivation = value
    },
    button_borders({ button }, value) {

      button.borders = value
    },
    button_clickSound({ button }, value) {
      button.clickSound = value
    },
    interface_outputLine({ ui }, value) {
      ui.outputLine = value
    },

  },

  actions: {

    keymap_push({ state, commit }, { side, code }: { side: Side, code: string }) {
      if (!Object.values(state.keyMapping).find((sides) => sides.includes(code))) {
        state.keyMapping[side].push(code)
      }
      commit('keyMapping_' + side, state.keyMapping[side])
      state.selectedKey = undefined
    },
    keymap_remove({ state, commit }, { side, code }: { side: Side, code: string }) {
      commit('keyMapping_' + side, state.keyMapping[side].filter((c) => c !== code))
      state.selectedKey = undefined
    },

    interface_outputLine({ state, commit }) {
      commit('interface_outputLine', !state.ui.outputLine)
    },

    button_enabled({ state }) {
      state.button.enabled = !state.button.enabled
    },

    async editor_new_file({ state, dispatch }, file: string) {
      file += '.linka'
      state.editor.current = file;
      state.editor.temp = await storageService.defaultToTemp(file)
      dispatch('editor_load_set')
    },

    async editor_current({ state, dispatch }, file: string) {
      state.editor.current = file;
      state.editor.temp = await storageService.copyToTemp(file)
      dispatch('editor_load_set')

    },
    async editor_load_set({ state, commit }) {
      const config = await storageService.getConfigFile(state.editor.temp!);
      if (config) {
        commit('editor_columns', config.columns);
        commit('editor_rows', config.rows);
        commit('editor_cards', config.cards);
        commit('editor_description', config.description);
        commit('editor_isWithoutSpace', config.withoutSpace);
        commit('editor_isDirectSet', !!config.directSet);
        commit('editor_isQuiz', !!config.quiz);
        commit('editor_questions', config.questions ?? []);
      }
    }
    ,
    async editor_save({ state, commit }) {
      await storageService.saveSet(state.editor.temp, state.editor.current, {
        cards: state.editor.cards,
        columns: state.editor.columns,
        rows: state.editor.rows,
        directSet: state.editor.isDirectSet,
        withoutSpace: state.editor.isWithoutSpace,
        questions: state.editor.questions,
        quiz: state.editor.quiz,
        quizAutoNext: state.editor.quizAutoNext,
        quizReadQuestion: state.editor.quizReadQuestion,
        description: state.editor.description,
        version: '2.0'
      })
    },
    async editor_save_as({ state, commit }, title) {

      const parts = state.editor.current.split(`§`)
      parts[parts.length - 1] = title
      const current = parts.join('§')
      await storageService.saveSet(state.editor.temp, current, {
        cards: state.editor.cards,
        columns: state.editor.columns,
        rows: state.editor.rows,
        directSet: state.editor.isDirectSet,
        withoutSpace: state.editor.isWithoutSpace,
        description: state.editor.description,
        questions: state.editor.questions,
        quiz: state.editor.quiz,
        quizAutoNext: state.editor.quizAutoNext,
        quizReadQuestion: state.editor.quizReadQuestion,
        version: '2.0'
      })
      return current
    },
    async open_file({ state, commit }, filename) {

      const config = await storageService.getConfigFile(filename)

      if (config) {
        state.explorer.config = config;
        if (config.directSet != undefined) {
          commit("interface_outputLine", !config.directSet);
        } else {
          commit("interface_outputLine", true);
        }
      }

    }
  },
  plugins: [
    (store) => {
      store.subscribe((mutation, state) => {
        if (!fields.find(({ commit }) => {
          return mutation.type === commit
        })) return
        eStore.set(mutation.type, mutation.payload)
      })
    }
  ]
})

export default store


for (const field of fields) {
  store.commit(field.commit, eStore.get(field.commit, field.default))
}


interface Field<T> {
  commit: string;
  default: T
}