import { createStore , } from 'vuex'
import { LINKaStore } from './LINKaStore'

export default createStore<LINKaStore>({
  state: {
    button: {
      timeout: 1000,
      enabled: true
    },
    ui:{
      outputLine: true
    }
  },
  getters: {
    button_timeout({button}){
      return button.timeout
    },
    button_enabled({button}){
      return button.enabled
    },
    interface_outputLine({ui}){
      return ui.outputLine
    }
  },
  mutations: {
  },
  actions: {
    interface_outputLine({state}){
      state.ui.outputLine=!state.ui.outputLine
    },

    button_enabled({state}){
      state.button.enabled=!state.button.enabled
    }
  },
  modules: {
  }
})
