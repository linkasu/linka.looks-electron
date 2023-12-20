<template>
        <v-row>
            <v-col xs="6">
            <v-checkbox
                v-model="animation"
                label="Анимация изображений"
            />
            </v-col>
            <v-col xs="6" class="settingColumn">
                <div class="settingGroup">
                <v-btn variant="tonal" size="small" @click="decreaseFontSize" class="btn_settings">-</v-btn>
                <div class="fontSetting">{{fontSize}}</div>
                <v-btn variant="tonal" size="small" @click="increaseFontSize" class="btn_settings">+</v-btn>
            </div>
                <v-btn :variant="fontBold? 'text' : 'tonal'" size="small" :class="fontBold? 'btn-fontBold btn-fontBold_bold':'btn-fontBold'" :color="fontBold ? 'primary':''" @click="toggleBold">B</v-btn>
            </v-col>
            <v-col xs="6"></v-col>
            <v-col xs="6"></v-col>
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
  set (value: boolean) {
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