// Styles
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import store from '@/store'
// Vuetify
import { createVuetify } from 'vuetify'




export default createVuetify(
  {
    theme: {
      themes: {
        light: {
          colors: {
            primary: store.getters.colors.primary,
            secondary: store.getters.colors.secondary,
            accent: store.getters.colors.accent,
          },
        }
      },
    },
  }
)
