<template>
  <v-dialog
    v-model="dialog"
    fullscreen
    width="50%"
    class="set-settings"
    right="50%"
  >
    <template #activator="{ props }">
      <v-btn flat i v-bind="props">
        Открыть настройки набора
      </v-btn>
    </template>
    <v-card>
      <v-toolbar>
        <v-toolbar-title>Настройки набора </v-toolbar-title>
        <v-spacer />
        <v-btn @click="dialog = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-toolbar>
      <v-card-text>
        <v-form @submit.prevent="">
          <v-card-subtitle>Настройки текущей страницы</v-card-subtitle>
          <v-layout row wrap>
            <v-col>
              <v-select
                v-model="mode"
                :items="modeOptions"
                label="Режим страницы"
                item-title="text"
                item-value="value"
              />
            </v-col>
          </v-layout>
          <v-layout row wrap>
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
                :disabled="mode === 'match'"
                type="number"
              />
            </v-col>
          </v-layout>
          <v-text-field
            v-if="mode === 'quiz'"
            v-model="question"
            label="Вопрос текущей страницы"
          />
          <section v-if="mode === 'quiz'">
            <v-card-subtitle> Настройки викторины </v-card-subtitle>
            <v-checkbox
              v-model="editor_quizAutoNext"
              label="Переключать на следующий вопрос при любом ответе"
            />
            <v-checkbox
              v-model="editor_quizReadQuestion"
              label="Зачитывать вопрос"
            />
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
import { computed, ref, withDefaults, defineProps } from "vue";
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
  get (): SetPage[] {
    return store.state.editor.pages ?? [];
  },
  set (value: SetPage[]) {
    store.commit("editor_pages", value);
  }
});

const currentPage = computed({
  get (): SetPage {
    return normalizePage(pages.value[pageIndex.value] ?? {
      mode: "standard",
      columns: 3,
      rows: 3,
      cards: []
    });
  },
  set (value: SetPage) {
    const nextPages = [...pages.value];
    nextPages[pageIndex.value] = normalizePage(value);
    pages.value = nextPages;
  }
});

const columns = computed({
  get () {
    return currentPage.value.columns;
  },
  set (value: number) {
    currentPage.value = { ...currentPage.value, columns: value };
  }
});

const rows = computed({
  get (): number {
    return currentPage.value.rows;
  },
  set (value: number) {
    currentPage.value = { ...currentPage.value, rows: mode.value === "match" ? 2 : value };
  }
});

const question = computed({
  get (): string {
    return currentPage.value.question ?? "";
  },
  set (value: string) {
    currentPage.value = { ...currentPage.value, question: value };
  }
});

const mode = computed({
  get (): PageMode {
    return currentPage.value.mode;
  },
  set (value: PageMode) {
    currentPage.value = normalizePage({
      ...currentPage.value,
      mode: value,
      rows: value === "match" ? 2 : currentPage.value.rows
    });
  }
});

const isWithoutSpace = computed({
  get (): boolean {
    return store.state.editor.isWithoutSpace;
  },
  set (value: boolean) {
    store.commit("editor_isWithoutSpace", value);
  }
});

const isDirectSet = computed({
  get (): boolean {
    return store.state.editor.isDirectSet;
  },
  set (value: boolean) {
    store.commit("editor_isDirectSet", value);
  }
});

const editor_quizReadQuestion = computed({
  get (): boolean {
    return store.state.editor.quizReadQuestion;
  },
  set (value: boolean) {
    store.commit("editor_quizReadQuestion", value);
  }
});

const editor_quizAutoNext = computed({
  get (): boolean {
    return store.state.editor.quizAutoNext;
  },
  set (value: boolean) {
    store.commit("editor_quizAutoNext", value);
  }
});
</script>

<style>
.set-settings > .v-overlay__content {
  position: absolute;
  right: 0;
  margin-left: 50% !important;
}
</style>
