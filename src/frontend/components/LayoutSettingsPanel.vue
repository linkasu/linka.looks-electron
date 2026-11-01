<template>
  <div class="settingsPanel" v-if="isSettingsPanelOpen === true">
    <v-btn variant="tonal" @click="closeSettings" min-height="48" class="btn_close">
      Сохранить и закрыть
      <v-icon>mdi-close</v-icon>
    </v-btn>
    <v-row>
      <v-col cols="12" md="3" sm="6">
        <v-card-text>
          <v-card-subtitle class="pl-2 pr-2">Настройка анимации</v-card-subtitle>
          <v-checkbox v-model="animation" label="Анимация изображений" />
        </v-card-text>
      </v-col>
      <v-col cols="12" md="3" sm="6">
        <v-card-text>
          <v-card-subtitle class="pl-0">Настройки шрифта</v-card-subtitle>
          <v-row class="mt-0 ml-0 mr-0 mb-0 btn_settings-row">
            <div class="settingGroup">
              <v-btn
                :disabled="fontSize - 1 < 16"
                variant="tonal"
                min-height="48"
                min-width="48"
                aria-label="Уменьшить размер текста"
                @click="decreaseFontSize"
                class="btn_settings"
                >-</v-btn
              >
              <div class="fontSettingLabel v-label" role="status">{{ fontSize }} px</div>
              <v-btn
                :disabled="fontSize + 1 > 30"
                variant="tonal"
                min-height="48"
                min-width="48"
                aria-label="Увеличить размер текста"
                @click="increaseFontSize"
                class="btn_settings"
                >+</v-btn
              >
            </div>
            <v-btn
              :variant="fontBold ? 'text' : 'tonal'"
              min-height="48"
              min-width="48"
              aria-label="Полужирный текст"
              :aria-pressed="fontBold"
              :class="fontBold ? 'btn-fontBold btn-fontBold_bold' : 'btn-fontBold'"
              :color="fontBold ? 'primary' : ''"
              @click="toggleBold"
              >B</v-btn
            >
          </v-row>
        </v-card-text>
      </v-col>
      <v-col cols="12" md="6" sm="12">
        <v-card-text>
          <v-form @submit.prevent="">
            <v-card-subtitle>Настройки размера сетки</v-card-subtitle>
            <v-row v-if="currentPage.mode !== 'match'" class="pl-0 pr-0 grid_settings">
              <v-col sm="6" cols="12">
                <v-text-field v-model="columns" label="Количество колонок" :min="1" type="number" />
              </v-col>
              <v-col sm="6" cols="12">
                <v-text-field v-model="rows" label="Количество строк" :min="1" type="number" />
              </v-col>
            </v-row>
            <v-row v-else class="pl-0 pr-0 grid_settings">
              <v-col sm="6" cols="12">
                <v-text-field
                  v-model="topColumns"
                  label="Карточки в верхней строке"
                  :min="1"
                  type="number"
                />
              </v-col>
              <v-col sm="6" cols="12">
                <v-text-field
                  v-model="bottomColumns"
                  label="Карточки в нижней строке"
                  :min="1"
                  type="number"
                />
              </v-col>
            </v-row>
          </v-form>
        </v-card-text>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { useStore } from "vuex";
import { normalizePage, type SetPage } from "@/common/interfaces/ConfigFile";

const store = useStore();

const animation = computed({
  get() {
    return store.state.button.animation;
  },
  set() {
    store.dispatch("button_animation_toggle");
  }
});
const fontSize = computed({
  get() {
    return store.state.layoutSettings.fontSize;
  },
  set(value: number) {
    store.dispatch("fontSize_change", value);
  }
});
const fontBold = computed(() => {
  return store.state.layoutSettings.fontBold;
});
async function increaseFontSize() {
  fontSize.value = fontSize.value + 1;
}
async function decreaseFontSize() {
  fontSize.value = fontSize.value - 1;
}

async function toggleBold() {
  store.dispatch("fontBold_toggle");
}

const columns = computed({
  get() {
    const page = currentPage.value;
    return page.columns;
  },
  async set(v: number) {
    currentPage.value = { ...currentPage.value, columns: v };
  }
});

const rows = computed({
  get(): number {
    return currentPage.value.rows;
  },
  async set(v: number) {
    currentPage.value = { ...currentPage.value, rows: v };
  }
});

const topColumns = computed({
  get(): number {
    return currentPage.value.topColumns ?? currentPage.value.columns;
  },
  async set(v: number) {
    currentPage.value = { ...currentPage.value, topColumns: v };
  }
});

const bottomColumns = computed({
  get(): number {
    return currentPage.value.bottomColumns ?? currentPage.value.columns;
  },
  async set(v: number) {
    currentPage.value = { ...currentPage.value, bottomColumns: v };
  }
});

const isSettingsPanelOpen = computed(() => {
  return store.state.layoutSettings.isOpened;
});

async function closeSettings() {
  await save();
  store.dispatch("toggle_settings_opened");
}

async function save() {
  await store.dispatch("editor_save");
  if (store.state.editor.current) {
    await store.dispatch("open_file", store.state.editor.current);
  }
}

const currentPageIndex = computed(() => store.state.explorer.page ?? 0);

const editorPages = computed({
  get(): SetPage[] {
    return store.state.editor.pages ?? [];
  },
  set(value: SetPage[]) {
    store.commit("editor_pages", value);
  }
});

const currentPage = computed({
  get(): SetPage {
    return normalizePage(
      editorPages.value[currentPageIndex.value] ?? {
        mode: "standard",
        columns: 3,
        rows: 3,
        cards: []
      }
    );
  },
  set(value: SetPage) {
    const pages = [...editorPages.value];
    pages[currentPageIndex.value] = normalizePage(value);
    editorPages.value = pages;
  }
});
</script>
<style scoped>
.settingsPanel {
  z-index: 1005;
  width: 100%;
  background-color: var(--linka-surface);
  color: var(--linka-text);
  border-bottom: 1px solid var(--linka-border);
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
}
.btn_close {
  align-self: flex-end;
}
.settingColumn {
  display: flex;
  align-items: flex-start;
}
.settingGroup {
  display: flex;
  flex-wrap: wrap;
}
.fontSettingLabel {
  padding: 12px 8px;
  white-space: nowrap;
}
.btn_settings-row {
  align-items: center;
  min-height: 3.5rem;
  flex-wrap: wrap;
  gap: 8px;
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
