<template>
  <v-row>
    <v-col md="3" sm="6" xs="9">
      <v-card-text>
        <v-card-subtitle>Настройка анимации</v-card-subtitle>
        <v-checkbox
          v-model="animation"
          label="Анимация изображений"
        />
      </v-card-text>
    </v-col>
    <v-col md="3" sm="6" xs="9">
      <v-card-text>
        <v-card-subtitle class="pl-0">Настройки шрифта</v-card-subtitle>
        <v-row class="mt-3 ml-0 mr-0 mb-0">
          <div class="settingGroup">
            <v-btn variant="tonal" size="small" @click="decreaseFontSize" class="btn_settings">-</v-btn>
            <div class="fontSetting">{{fontSize}}</div>
            <v-btn variant="tonal" size="small" @click="increaseFontSize" class="btn_settings">+</v-btn>
          </div>
          <v-btn :variant="fontBold? 'text' : 'tonal'" size="small" :class="fontBold? 'btn-fontBold btn-fontBold_bold':'btn-fontBold'" :color="fontBold ? 'primary':''" @click="toggleBold">B</v-btn>
        </v-row>
      </v-card-text>
    </v-col>
    <v-col md="6" sm="9">
      <v-card-text>
        <v-form @submit.prevent="">
          <v-card-subtitle>Настройки размера сетки</v-card-subtitle>
          <v-layout
            row
            wrap
            class="pl-0 pr-0"
          >
            <v-col>
              <v-text-field
                v-model="columns"
                label="Количество колонок"
                :min="1"
                type="number"
              />
            </v-col>
            <v-col>
              <v-text-field
                v-model="rows"
                label="Количество строк"
                :min="1"
                type="number"
              />
            </v-col>
          </v-layout>
        </v-form>
      </v-card-text>
    </v-col>
  </v-row>
</template>
  
  <script lang="ts" setup>
  import { computed } from "vue";
  import { useStore } from "vuex";
  
  const store = useStore();

  const animation = computed({
  get () {
    return store.state.button.animation;
  },
  set () {
    store.dispatch("button_animation_toggle");
  }
});
const fontSize = computed({
  get () {
    return store.state.font.fontSize;
  },
  set (value: boolean) {
    store.dispatch("fontSize_change", value);
  }
});
const fontBold = computed(() => {
  return store.state.font.fontBold;
});
async function increaseFontSize () {
    fontSize.value = fontSize.value + 1;
}
async function decreaseFontSize () {
    fontSize.value = fontSize.value - 1;
}
async function toggleBold () {
    store.dispatch("fontBold_toggle");
}

const columns = computed({
  get () {
    return store.state.editor.columns;
  },
  async set (v: number) {
    store.commit("editor_columns", v);
  }
});

const rows = computed({
  get (): number {
    return store.state.editor.rows;
  },
  async set (v: number) {
    store.commit("editor_rows", v);
  }
});

  </script>
  <style scoped>
  .settingColumn {
    display: flex;
    align-items: flex-start;
  }
  .settingGroup {
    display: flex;
  }
  .fontSetting {
    padding: 2px 8px;
  }
  .btn_settings {
    font-size: 20px;
  }
  .btn-fontBold {
    font-weight: 400;
    font-size: 20px;
    margin-left: 8px;
  }
  .btn-fontBold_bold {
    font-weight: 600;
  }
  </style>