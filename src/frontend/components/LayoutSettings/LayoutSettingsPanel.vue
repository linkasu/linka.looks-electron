<template>
  <v-row>
    <v-col md="3" sm="6" xs="9">
      <v-card-text>
        <v-card-subtitle class="pl-2 pr-2">Настройка анимации</v-card-subtitle>
        <v-checkbox
          v-model="animation"
          label="Анимация изображений"
        />
      </v-card-text>
    </v-col>
    <v-col md="3" sm="6" xs="9">
      <v-card-text>
        <v-card-subtitle class="pl-0">Настройки шрифта</v-card-subtitle>
        <v-row class="mt-0 ml-0 mr-0 mb-0 btn_settings-row">
          <div class="settingGroup">
            <v-btn variant="tonal" size="small" @click="decreaseFontSize" class="btn_settings">-</v-btn>
            <div class="fontSettingLabel v-label">{{fontSize}}</div>
            <v-btn variant="tonal" size="small" @click="increaseFontSize" class="btn_settings">+</v-btn>
          </div>
          <v-btn :variant="fontBold? 'text' : 'tonal'" size="small" :class="fontBold? 'btn-fontBold btn-fontBold_bold':'btn-fontBold'" :color="fontBold ? 'primary':''" @click="toggleBold">B</v-btn>
        </v-row>
      </v-card-text>
    </v-col>
    <v-col md="6" sm="12">
      <v-card-text>
        <v-form @submit.prevent="">
          <v-card-subtitle>Настройки размера сетки</v-card-subtitle>
          <v-layout
            wrap
            class="pl-0 pr-0 grid_settings"
          >
            <v-col sm="6" cols="12">
              <v-text-field
                v-model="columns"
                label="Количество колонок"
                :min="1"
                type="number"
              />
            </v-col>
            <v-col sm="6"  cols="12">
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
    flex-flow: nowrap;
  }
  .fontSettingLabel {
    padding: 2px 8px;
  }
  .btn_settings-row {
    align-items: center;
    min-height: 3.5rem;
    flex-flow: nowrap;
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
  .grid_settings {
    overflow-y: visible !important;
    flex-wrap: wrap;
  }
  </style>