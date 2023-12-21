<template>
        <v-row>
            <v-col xs="6">
            <v-checkbox
                v-model="animation"
                label="Анимация изображений"
            />
            </v-col>
            <v-col xs="6" class="settingColumn">
              <v-card-text>
                <v-card-subtitle>Настройки шрифта</v-card-subtitle>
                <v-row>
                <div class="settingGroup">
                  <v-btn variant="tonal" size="small" @click="decreaseFontSize" class="btn_settings">-</v-btn>
                  <div class="fontSetting">{{fontSize}}</div>
                  <v-btn variant="tonal" size="small" @click="increaseFontSize" class="btn_settings">+</v-btn>
                </div>
                <v-btn :variant="fontBold? 'text' : 'tonal'" size="small" :class="fontBold? 'btn-fontBold btn-fontBold_bold':'btn-fontBold'" :color="fontBold ? 'primary':''" @click="toggleBold">B</v-btn>
              </v-row>
              </v-card-text>
              </v-col>
            <v-col xs="6">
              <v-card-text>
                <v-form @submit.prevent="">
                  <v-card-subtitle>Настройки размера сетки</v-card-subtitle>
                  <v-layout
                    row
                    wrap
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
function increaseFontSize () {
    fontSize.value = fontSize.value + 1;
}
function decreaseFontSize () {
    fontSize.value = fontSize.value - 1;
}
function toggleBold () {
    store.dispatch("fontBold_toggle");
}

const columns = computed({
  get () {
    return store.state.editor.columns;
  },
  async set (v: number) {
    store.commit("editor_columns", v);
    await save();
  }
});

const rows = computed({
  get (): number {
    return store.state.editor.rows;
  },
  async set (v: number) {
    store.commit("editor_rows", v);
    await save();
  }
});

async function save () {
  await store.dispatch("editor_save");
}
const emit = defineEmits<{
  (e: "save"): void
  (e: "saveAs", payload: string): void
}>();
  </script>
  <style scoped>
  .settingColumn {
    display: flex;
    align-items: flex-start;
  }
  .settingGroup {
    display: flex;
    padding-top: 14px;
  }
  .fontSetting {
    padding: 2px 8px;
  }
  .btn_settings {
    font-size: 20px;
  }
  .btn-fontBold {
    margin-top: 14px;
    font-weight: 400;
    font-size: 20px;
    margin-left: 8px;
  }
  .btn-fontBold_bold {
    font-weight: 600;
  }
  </style>