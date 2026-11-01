// Styles
import "@mdi/font/css/materialdesignicons.css";
import "vuetify/styles";
import store from "@/frontend/store";
// Vuetify
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { watch } from "vue";

const vuetify = createVuetify({
  components,
  directives,
  defaults: {
    VAppBar: { elevation: 0, border: "b", color: "surface" },
    VCard: { rounded: "lg", elevation: 0, border: true },
    VSheet: { color: "transparent" },
    VBtn: { rounded: "lg", minHeight: 44 },
    VTextField: { variant: "outlined", density: "comfortable" },
    VTextarea: { variant: "outlined", density: "comfortable" },
    VSelect: { variant: "outlined", density: "comfortable" },
    VCheckbox: { color: "primary" },
    VRadioGroup: { color: "primary" },
    VDialog: { maxWidth: 640 }
  },
  theme: {
    themes: {
      light: {
        colors: {
          ...store.state.colors,
          background: "#F6F7F4",
          surface: "#FFFFFF",
          "on-surface": "#243431",
          "on-background": "#243431",
          error: "#A33838",
          success: "#28675F",
          warning: "#835B16",
          info: "#197377"
        }
      }
    }
  }
});

watch(
  () => ({ ...store.state.colors }),
  (colors) => Object.assign(vuetify.theme.themes.value.light.colors, colors)
);

export default vuetify;
