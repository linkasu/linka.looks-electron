// Styles
import "@mdi/font/css/materialdesignicons.css";
import "vuetify/styles";
import store from "@/frontend/store";
// Vuetify
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";

export default createVuetify(
  {
    components,
    directives,
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
