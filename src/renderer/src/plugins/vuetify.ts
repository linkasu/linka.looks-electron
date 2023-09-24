// Styles
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import store from '../store'
// Vuetify
import { createVuetify } from 'vuetify'

export default createVuetify({
  theme: {
    themes: {
      light: {
        colors: {
          primary: store.state.colors.primary,
          secondary: store.state.colors.secondary,
          accent: store.state.colors.accent
        }
      }
    }
  }
})
