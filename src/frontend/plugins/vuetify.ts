// Styles
import "@mdi/font/css/materialdesignicons.css";
import "vuetify/styles";
// @ts-ignore
import store from "@frontend/store";
// Vuetify
import { createVuetify } from "vuetify";

export default createVuetify(
  {
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
  }
);
