<template>
  <v-container>
    <v-row>
      <v-col cols="12" md="8">
        <v-card>
          <v-card-title primary-title> Главные настройки </v-card-title>
          <v-card-text>
            <v-text-field
              type="number"
              label="Время задержки взгляда для активации"
              v-model="eyetrackerTimeout"
              min="0.1"
              max="5"
              step="0.1"
            ></v-text-field>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="4">
        <color-settings />
      </v-col>
    </v-row>
  </v-container>
</template>

<script lang="ts">
import { Vue, prop, Options } from "vue-class-component";
import ColorSettings from "@/components/Settings/ColorsSettings.vue";
class Props {}

@Options({
  components: {
    ColorSettings,
  },
})
export default class SettingsView extends Vue.with(Props) {
  get eyetrackerTimeout() {
    return this.$store.state.button.timeout / 1000;
  }
  set eyetrackerTimeout(value: number) {
    this.$store.commit("button_timeout", value * 1000);
  }
}
</script>
