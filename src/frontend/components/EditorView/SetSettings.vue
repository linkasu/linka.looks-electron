<template>
  <v-dialog v-model="dialog" class="set-settings" scrollable>
    <template #activator="{ props }">
      <v-btn
        variant="text"
        prepend-icon="mdi-cog-outline"
        aria-label="Открыть настройки набора"
        title="Настройки набора"
        v-bind="props"
        ><span class="settings-label">Настройки набора</span></v-btn
      >
    </template>
    <v-card>
      <v-toolbar>
        <v-toolbar-title>Настройки набора </v-toolbar-title>
        <v-spacer />
        <v-btn icon aria-label="Закрыть настройки набора" @click="dialog = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-toolbar>
      <v-card-text>
        <p class="settings-hint">
          Изменения применяются сразу. Чтобы сохранить их в файле, нажмите «Сохранить» в редакторе.
        </p>
        <v-form @submit.prevent="">
          <v-card-subtitle>Настройки текущей страницы</v-card-subtitle>
          <v-row>
            <v-col cols="12">
              <v-select
                v-model="mode"
                :items="modeOptions"
                label="Режим страницы"
                item-title="text"
                item-value="value"
              />
            </v-col>
          </v-row>
          <v-row v-if="mode !== 'match'">
            <v-col cols="12" sm="6">
              <v-text-field v-model="columns" label="Количество колонок" :min="1" type="number" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="rows" label="Количество строк" :min="1" type="number" />
            </v-col>
          </v-row>
          <v-row v-else>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="topColumns"
                label="Карточки в верхней строке"
                :min="1"
                type="number"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="bottomColumns"
                label="Карточки в нижней строке"
                :min="1"
                type="number"
              />
            </v-col>
          </v-row>
          <v-text-field v-if="mode === 'quiz'" v-model="question" label="Вопрос текущей страницы" />
          <section v-if="mode === 'quiz'">
            <v-card-subtitle> Настройки викторины </v-card-subtitle>
            <v-checkbox
              v-model="editor_quizAutoNext"
              label="Переключать на следующий вопрос при любом ответе"
            />
            <v-checkbox v-model="editor_quizReadQuestion" label="Зачитывать вопрос" />
          </section>

          <v-card-subtitle> Настройки набора </v-card-subtitle>
          <v-checkbox
            v-model="isWithoutSpace"
            label="Набор для печати текста (если создаете клавиатуру)"
            :disabled="mode !== 'standard'"
          />
          <v-checkbox
            v-model="isDirectSet"
            label="Скрыть строку вывода и озвучивать карточку сразу при нажатии на нее"
            :disabled="mode !== 'standard'"
          />
        </v-form>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { computed, ref } from "vue";
import { useStore } from "vuex";
import type { PageMode, SetPage } from "@/common/interfaces/ConfigFile";
import { normalizePage } from "@/common/interfaces/ConfigFile";

const store = useStore();

const props = withDefaults(defineProps<{ defaultOpen?: boolean }>(), { defaultOpen: false });

const dialog = ref(props.defaultOpen);

const modeOptions = [
  { text: "Обычная страница", value: "standard" },
  { text: "Викторина", value: "quiz" },
  { text: "Соотнесение", value: "match" }
];

const pageIndex = computed(() => store.state.editor.page ?? 0);

const pages = computed({
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
      pages.value[pageIndex.value] ?? {
        mode: "standard",
        columns: 3,
        rows: 3,
        cards: []
      }
    );
  },
  set(value: SetPage) {
    const nextPages = [...pages.value];
    nextPages[pageIndex.value] = normalizePage(value);
    pages.value = nextPages;
  }
});

const columns = computed({
  get() {
    return currentPage.value.columns;
  },
  set(value: number) {
    currentPage.value = { ...currentPage.value, columns: value };
  }
});

const rows = computed({
  get(): number {
    return currentPage.value.rows;
  },
  set(value: number) {
    currentPage.value = { ...currentPage.value, rows: value };
  }
});

const topColumns = computed({
  get(): number {
    return currentPage.value.topColumns ?? currentPage.value.columns;
  },
  set(value: number) {
    currentPage.value = { ...currentPage.value, topColumns: value };
  }
});

const bottomColumns = computed({
  get(): number {
    return currentPage.value.bottomColumns ?? currentPage.value.columns;
  },
  set(value: number) {
    currentPage.value = { ...currentPage.value, bottomColumns: value };
  }
});

const question = computed({
  get(): string {
    return currentPage.value.question ?? "";
  },
  set(value: string) {
    currentPage.value = { ...currentPage.value, question: value };
  }
});

const mode = computed({
  get(): PageMode {
    return currentPage.value.mode;
  },
  set(value: PageMode) {
    currentPage.value = normalizePage({
      ...currentPage.value,
      mode: value,
      rows: value === "match" ? 2 : currentPage.value.rows
    });
  }
});

const isWithoutSpace = computed({
  get(): boolean {
    return store.state.editor.isWithoutSpace;
  },
  set(value: boolean) {
    store.commit("editor_isWithoutSpace", value);
  }
});

const isDirectSet = computed({
  get(): boolean {
    return store.state.editor.isDirectSet;
  },
  set(value: boolean) {
    store.commit("editor_isDirectSet", value);
  }
});

const editor_quizReadQuestion = computed({
  get(): boolean {
    return store.state.editor.quizReadQuestion;
  },
  set(value: boolean) {
    store.commit("editor_quizReadQuestion", value);
  }
});

const editor_quizAutoNext = computed({
  get(): boolean {
    return store.state.editor.quizAutoNext;
  },
  set(value: boolean) {
    store.commit("editor_quizAutoNext", value);
  }
});
</script>

<style>
.set-settings > .v-overlay__content {
  left: auto !important;
  right: 0;
  top: 0;
  bottom: 0;
  width: min(560px, 100%) !important;
  max-width: 100% !important;
  max-height: 100% !important;
  height: 100%;
  margin: 0 !important;
}

.set-settings .v-card-subtitle {
  margin: 24px 0 12px;
  padding: 0;
  font-weight: 600;
  opacity: 1;
  color: var(--linka-text);
}

.set-settings .settings-hint {
  color: var(--linka-muted);
  margin-bottom: 16px;
}
@media (max-width: 600px) {
  .settings-label {
    display: none;
  }
}
</style>
