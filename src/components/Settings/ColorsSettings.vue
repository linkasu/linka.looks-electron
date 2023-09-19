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

<script lang="ts" setup>
import { computed } from "vue";
import { useStore } from "vuex";

const store = useStore();

const borders = computed({
  get () { return store.state.button.borders; },
  set (value: number) { store.commit("button_borders", value); },
});

const colorPrimary = computed({
  get () { return store.state.colors.primary; },
  set (v: string) { store.commit("colors_primary", v); },
});

const colorAccent = computed({
  get () { return store.state.colors.accent; },
  set (v: string) { store.commit("colors_accent", v); },
})

const colorSecondary = computed({
  get () { return store.state.colors.secondary; },
  set (v: string) { store.commit("colors_secondary", v); },
});

function makeDefault () {
  colorPrimary.value = "#197377";
  colorAccent.value = "#7DF6FA";
  colorSecondary.value = "#FFD200";
  borders.value = 1;
}

function makeBG () {
  colorPrimary.value = "#DDDDDD";
  colorAccent.value = "#FFFFFF";
  colorSecondary.value = "#000000";
}
</script>
