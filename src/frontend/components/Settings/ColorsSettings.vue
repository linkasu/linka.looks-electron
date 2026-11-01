<template>
  <v-sheet>
    <v-card>
      <v-card-title> Цвета карточек </v-card-title>
      <v-card-text>
        <v-text-field v-model="colorPrimary" label="Основной акцент и выбор" type="color" />
        <v-text-field v-model="colorAccent" label="Фон вспомогательных кнопок" type="color" />
        <v-text-field v-model="colorSecondary" label="Цвет границ" type="color" />
        <v-slider
          v-model="borders"
          :label="`Ширина границ сетки ${borders.toFixed(1)}px`"
          step="0.1"
          min="0"
          max="5"
        />
        <p class="mb-2">Предпросмотр карточек — без активации взглядом</p>
        <div class="color-preview" aria-label="Предпросмотр цветов карточек">
          <eye-button preview>Карточка</eye-button>
          <eye-button preview color="accent">Навигация</eye-button>
          <eye-button preview color="primary">Действие</eye-button>
        </div>
      </v-card-text>
    </v-card>
    <v-card>
      <v-card-title> Готовые цветовые схемы </v-card-title>
      <v-card-text>
        <p class="mb-3">Заменяют текущие цвета только после нажатия.</p>
        <v-btn block variant="tonal" min-height="48" @click="makeDefault">Спокойная</v-btn>
        <v-btn block variant="outlined" min-height="48" class="mt-2" @click="makeBG"
          >Чёрно-белая</v-btn
        >
      </v-card-text>
    </v-card>
  </v-sheet>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { useStore } from "vuex";
import EyeButton from "../EyeButton.vue";
import { DEFAULT_COLORS } from "@/frontend/plugins/visualDefaults";

const store = useStore();

const borders = computed({
  get() {
    return store.state.button.borders;
  },
  set(value: number) {
    store.commit("button_borders", value);
  }
});

const colorPrimary = computed({
  get() {
    return store.state.colors.primary;
  },
  set(v: string) {
    store.commit("colors_primary", v);
  }
});

const colorAccent = computed({
  get() {
    return store.state.colors.accent;
  },
  set(v: string) {
    store.commit("colors_accent", v);
  }
});

const colorSecondary = computed({
  get() {
    return store.state.colors.secondary;
  },
  set(v: string) {
    store.commit("colors_secondary", v);
  }
});

function makeDefault() {
  colorPrimary.value = DEFAULT_COLORS.primary;
  colorAccent.value = DEFAULT_COLORS.accent;
  colorSecondary.value = DEFAULT_COLORS.secondary;
  borders.value = 1;
}

function makeBG() {
  colorPrimary.value = "#DDDDDD";
  colorAccent.value = "#FFFFFF";
  colorSecondary.value = "#000000";
  borders.value = Math.max(1, borders.value);
}
</script>

<style scoped>
.color-preview {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.color-preview :deep(.eyebtn) {
  min-height: 80px;
  padding: 12px;
  border-radius: 12px;
}
</style>
