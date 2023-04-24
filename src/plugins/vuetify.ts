// Styles
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'

// Vuetify
import { createVuetify } from 'vuetify'

export default createVuetify(
  {
    theme: {
      themes: {
        light: {
          colors: {
            primary: '#197377',
            secondary: '#AD9F4E',
            accent: '#7DF6FA',
          },
        }
      },
    },
  }
)
