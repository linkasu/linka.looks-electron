import { createStore, } from 'vuex'
import { LINKaStore } from './LINKaStore'
import { storageService } from '@/CardsStorage/frontend'

export default createStore<LINKaStore>({
  state: {
    button: {
      timeout: 1000,
      enabled: true
    },
    ui: {
      outputLine: true
    },
    editor: {
      current: '',
      temp: '',
      cards: [],
      columns: 3,
      rows: 3,
      isDirectSet: false, isWithoutSpace: false
    }
  },
  getters: {

    button_timeout({ button }) {
      return button.timeout
    },
    button_enabled({ button }) {
      return button.enabled
    },
    interface_outputLine({ ui }) {
      return ui.outputLine
    },
    editor_current({ editor }) {
      return editor.current
    },
    editor_temp({ editor }) {
      return editor.temp
    },
    editor_cards({ editor }) {
      return editor.cards
    },
    editor_columns({ editor }) {
      return editor.columns
    },
    editor_rows({ editor }) {
      return editor.rows
    },
    editor_isDirectSet({ editor }) {
      return editor.isDirectSet
    },
    editor_isWithoutSpace({ editor }) {
      return editor.isWithoutSpace
    },
  },
  mutations: {
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

    button_enabled({ button }, value) {
      button.enabled = value
    },
    interface_outputLine({ ui }, value) {
      ui.outputLine = value
    },

  },
  actions: {
    interface_outputLine({ state, commit }) {
      commit('interface_outputLine', !state.ui.outputLine)
    },

    button_enabled({ state }) {
      state.button.enabled = !state.button.enabled
    },

    async editor_new_file({ state, dispatch }, file: string) {
      file+='.linka'
      state.editor.current = file;
      state.editor.temp = await storageService.defaultToTemp(file)
      dispatch('editor_load_set')
    },

    async editor_current({ state, dispatch }, file: string) {
      state.editor.current = file;
      state.editor.temp = await storageService.copyToTemp(file)
      dispatch('editor_load_set')

    },
    async editor_load_set({state, commit}){
      const config = await storageService.getConfigFile(state.editor.temp!);
      if (config) {
        commit('editor_columns', config.columns);
        commit('editor_rows', config.rows);
        commit('editor_cards', config.cards);
        commit('editor_isWithoutSpace', config.withoutSpace);
        commit('editor_isDirectSet', !!config.directSet);
        
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
        version: '1.0'
      })
    },
    async editor_save_as({ state, commit }, title) {
      
      const parts = state.editor.current.split(`§`)
      parts[parts.length-1] = title 
      const current = parts.join('§')
      await storageService.saveSet(state.editor.temp, current, {
        cards: state.editor.cards,
        columns: state.editor.columns,
        rows: state.editor.rows,
        directSet: state.editor.isDirectSet,
        withoutSpace: state.editor.isWithoutSpace,
        version: '1.0'
      })
      return current
    }

  },
  modules: {
  }
})
