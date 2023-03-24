import { createStore , } from 'vuex'
import { LINKaStore } from './LINKaStore'

export default createStore<LINKaStore>({
  state: {
    button: {
      timeout: 1000
    }
  },
  getters: {
    button_timeout({button}){
      return button.timeout
    }
  },
  mutations: {
  },
  actions: {
  },
  modules: {
  }
})
