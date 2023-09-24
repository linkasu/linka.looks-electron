<template>
  <v-sheet>
    <v-card>
      <v-card-title> Настройки цвета </v-card-title>
      <v-card-text>
        <v-text-field
          v-model="colorPrimary"
          label="Цвет №1"
          type="color"
        />
        <v-text-field
          v-model="colorAccent"
          label="Цвет №2"
          type="color"
        />
        <v-text-field
          v-model="colorSecondary"
          label="Цвет границ"
          type="color"
        />
        <v-slider
          v-model="borders"
          :label="`Ширина границ сетки ${borders.toFixed(1)}px`"
          step="0.1"
          min="0"
          max="5"
        />
      </v-card-text>
    </v-card>
    <v-card>
      <v-card-title> Шаблоны цветовых схем.</v-card-title>
      <v-card-text>
        <v-row>
          <v-btn
            block
            color="success"
            @click="makeDefault"
          >
            Стандартная
          </v-btn>
          <v-btn
            block
            color="success"
            @click="makeBG"
          >
            Черно-белая
          </v-btn>
        </v-row>
      </v-card-text>
    </v-card>
  </v-sheet>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { useStore } from 'vuex'

const store = useStore()

const borders = computed({
  get() {
    return store.state.button.borders
  },
  set(value: number) {
    store.commit('button_borders', value)
  }
})

const colorPrimary = computed({
  get() {
    return store.state.colors.primary
  },
  set(v: string) {
    store.commit('colors_primary', v)
  }
})

const colorAccent = computed({
  get() {
    return store.state.colors.accent
  },
  set(v: string) {
    store.commit('colors_accent', v)
  }
})

const colorSecondary = computed({
  get() {
    return store.state.colors.secondary
  },
  set(v: string) {
    store.commit('colors_secondary', v)
  }
})

function makeDefault() {
  colorPrimary.value = '#197377'
  colorAccent.value = '#7DF6FA'
  colorSecondary.value = '#FFD200'
  borders.value = 1
}

function makeBG() {
  colorPrimary.value = '#DDDDDD'
  colorAccent.value = '#FFFFFF'
  colorSecondary.value = '#000000'
}
</script>
