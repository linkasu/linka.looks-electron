<template>
  <v-sheet>
    <v-card>
      <v-card-title> Настройки цвета </v-card-title>
      <v-card-text>
        <v-text-field
          label="Цвет №1"
          v-model="colorPrimary"
          type="color"
        ></v-text-field>
        <v-text-field
          label="Цвет №2"
          v-model="colorAccent"
          type="color"
        ></v-text-field>
        <v-text-field
          label="Цвет границ"
          v-model="colorSecondary"
          type="color"
        ></v-text-field>
        <v-slider
          :label="`Ширина границ сетки ${borders.toFixed(1)}px`"
          v-model="borders"
          step="0.1"
          min="0"
          max="5"

        ></v-slider>
      </v-card-text>
    </v-card>
    <v-card>
      <v-card-title> Шаблоны цветовых схем.</v-card-title>
      <v-card-text>
        <v-row>
          <v-btn block color="success" @click="makeDefault">Стандартная</v-btn>
          <v-btn block color="success" @click="makeBG">Черно-белая</v-btn>
        </v-row>
      </v-card-text>
    </v-card>
  </v-sheet>
</template>

<script lang="ts">
import { Vue, prop, Options } from "vue-class-component";

class Props {}

@Options({})
export default class extends Vue.with(Props) {
  get borders () {
    return store.state.button.borders;
  }

  set borders (value: number) {
    store.commit("button_borders", value);
  }

  get colorPrimary () {
    return store.state.colors.primary;
  }

  set colorPrimary (v: string) {
    store.commit("colors_primary", v);
  }

  get colorAccent () {
    return store.state.colors.accent;
  }

  set colorAccent (v: string) {
    store.commit("colors_accent", v);
  }

  get colorSecondary () {
    return store.state.colors.secondary;
  }

  set colorSecondary (v: string) {
    store.commit("colors_secondary", v);
  }

  makeDefault () {
    colorPrimary = "#197377";
    colorAccent = "#7DF6FA";
    colorSecondary = "#FFD200";
    borders = 1;
  }

  makeBG () {
    colorPrimary = "#DDDDDD";
    colorAccent = "#FFFFFF";
    colorSecondary = "#000000";
  }
}
</script>
