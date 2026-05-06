<template>
  <div fluid class="editor">
    <new-file-dialog :show="newFileDialogShow" :disabled="ui_disabled" @text="newFileName" />
    <div class="editor-body">
      <v-card v-if="filename" xs8 fill-height fluid>
        <v-card-title> Карточки </v-card-title>
        <v-card-text>
          <v-text-field
            v-if="pageMode === 'quiz'"
            v-model="question"
            label="Введите вопрос для этой страницы"
            :disabled="ui_disabled"
          />
          <div v-if="pageMode === 'match'" class="match-hint">
            Верхняя и нижняя строки образуют пары. Выберите карточку и свяжите её с карточкой из другой строки.
          </div>
        </v-card-text>
        <v-card-text class="cards-wrapper">
          <draggable
            v-model="current"
            item-key="id"
            class="cards"
            :style="{ '--rows': rows, '--columns': columns }"
            :disabled="ui_disabled"
          >
            <template #item="{ element, index }">
              <set-grid-button
                :key="element.id"
                :file="filename"
                :card="element"
                editor
                :class="{
                  selected: selected?.id === element?.id,
                  nonValid: !isValid(element),
                  pendingMatch: pendingMatchCardId === element.id
                }"
                :dot="pageMode === 'quiz' && !!element.answer"
                @click="select(index)"
              />
            </template>
          </draggable>
        </v-card-text>
        <v-card-text class="buttons">
          <v-layout>
            <v-row>
              <v-col xs="2">
                <v-btn block color="orange" :disabled="ui_disabled || page === 0" @click="page--">
                  <v-icon>mdi-arrow-left</v-icon>
                </v-btn>
              </v-col>
              <v-col xs="2">
                <v-btn block color="blue" :disabled="ui_disabled">
                  {{ page + 1 }} из {{ totalPages }}
                </v-btn>
              </v-col>
              <v-col xs="2">
                <v-btn block color="primary" :disabled="emptyPage || ui_disabled" @click="copyPage">
                  <v-icon>mdi-content-copy</v-icon>
                </v-btn>
              </v-col>
              <v-col xs="2">
                <v-btn block color="error" :disabled="ui_disabled" @click="deletePage">
                  <v-icon>mdi-delete-outline</v-icon>
                </v-btn>
              </v-col>
              <v-col xs="2">
                <v-btn block color="orange" :disabled="emptyPage || ui_disabled" @click="nextPage">
                  <v-icon>mdi-arrow-right</v-icon>
                </v-btn>
              </v-col>
            </v-row>
          </v-layout>
        </v-card-text>
      </v-card>
      <v-card v-if="selected" class="mt-7">
        <v-card-title primary-title>
          Редактирование
          <v-spacer />
          <v-btn
            v-if="selected.cardType !== CardTypes.NewCard"
            title="Копировать карточку"
            icon
            absolute
            depressed
            color="primary"
            class="copy"
            :disabled="ui_disabled"
            @click="copySelected"
          >
            <v-icon>mdi-content-copy</v-icon>
          </v-btn>
          <v-btn
            v-if="selected.cardType !== CardTypes.NewCard"
            title="Сбросить карточку"
            icon
            absolute
            depressed
            color="error"
            class="delete"
            :disabled="ui_disabled"
            @click="resetSelected"
          >
            <v-icon>mdi-delete</v-icon>
          </v-btn>
        </v-card-title>
        <v-card-text>
          <v-form>
            <v-row>
              <v-col>
                <v-select
                  v-model="selected.cardType"
                  :items="cardTypeOptions"
                  label="Тип карточки"
                  item-title="text"
                  item-value="value"
                  :disabled="ui_disabled"
                />
              </v-col>
            </v-row>
            <section v-if="selected.cardType === CardTypes.AudioCard">
              <v-row>
                <v-col>
                  <v-text-field v-model="selected.title" outline label="Название карточки" max-length="30" :disabled="ui_disabled" />
                </v-col>
              </v-row>
              <v-row>
                <v-card width="100%" elevation="0">
                  <v-card-title primary-title>
                    Работа с изображением
                  </v-card-title>
                  <v-card-text>
                    <v-container>
                      <v-row>
                        <v-btn block class="mb-1" :disabled="ui_disabled" @click="selectImage">
                          Выбрать картинку
                        </v-btn>
                      </v-row>
                      <v-row>
                        <create-from-text-dialog block :file="filename" @image="onImageSelected" />
                      </v-row>
                      <v-row>
                        <picture-bank-dialog block :file="filename" @image="onImageSelected" @name="onTitleSelected" />
                      </v-row>
                    </v-container>
                  </v-card-text>
                </v-card>
              </v-row>
              <v-row>
                <v-card width="100%" elevation="0">
                  <v-card-title primary-title>
                    Работа с озвучкой
                  </v-card-title>
                  <v-card-subtitle>
                    {{ selected.audioText ?? (selected.audioPath ? ".mp3 файл добавлен" : "Добавьте текст или .mp3 файл!") }}
                  </v-card-subtitle>
                  <v-card-text>
                    <v-container>
                      <v-row>
                        <TTSDialog
                          :file="filename"
                          @audio="onAudioFromTTS"
                          :audioText="selected.audioText"
                          :audioVoice="selected.audioVoice"
                        />
                      </v-row>
                      <v-row>
                        <v-btn block class="mb-1" :disabled="ui_disabled" @click="selectAudio">
                          Выбрать звук из файла
                        </v-btn>
                      </v-row>
                      <v-row v-if="selected.audioPath">
                        <v-btn block :disabled="ui_disabled" @click="playAudio">
                          Послушать озвучку
                        </v-btn>
                      </v-row>
                    </v-container>
                  </v-card-text>
                </v-card>
              </v-row>
              <v-row>
                <v-card v-if="pageMode === 'quiz'" width="100%">
                  <v-card-title primary-title>
                    Работа с викториной
                  </v-card-title>
                  <v-card-text>
                    <v-container>
                      <v-checkbox v-model="selected.answer" label="Отметить как правильный ответ" />
                    </v-container>
                  </v-card-text>
                </v-card>
                <v-card v-else-if="pageMode === 'match'" width="100%">
                  <v-card-title primary-title>
                    Работа со связями
                  </v-card-title>
                  <v-card-text>
                    <v-container>
                      <div class="mb-2">
                        Строка: {{ selectedLane === "top" ? "верхняя" : "нижняя" }}
                      </div>
                      <div class="mb-2" v-if="linkedCard">
                        Связана с: {{ linkedCard.title || "без названия" }}
                      </div>
                      <div class="mb-2" v-else>
                        Связь не задана
                      </div>
                      <v-btn block color="primary" class="mb-2" @click="toggleMatchLink">
                        {{ matchButtonLabel }}
                      </v-btn>
                      <v-btn block color="error" :disabled="!selected.matchId" @click="clearMatchLink">
                        Удалить связь
                      </v-btn>
                    </v-container>
                  </v-card-text>
                </v-card>
              </v-row>
            </section>
          </v-form>
        </v-card-text>
      </v-card>
      <v-card v-else>
        <v-card-title primary-title>
          Выберите картинку для начала работы
        </v-card-title>
        <v-card-text>
          <h3>Советы в редакторе наборов:</h3>
          <ul>
            <li>Для добавления новой карточки выберете любую с "+"</li>
            <li>Вы можете менять карточки местами, перетаскивая их</li>
          </ul>
        </v-card-text>
      </v-card>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from "vue";
import { useStore } from "vuex";
import { useRoute } from "vue-router";

import SetGridButton from "@/frontend/components/SetGridButton.vue";
import CreateFromTextDialog from "@/frontend/components/EditorView/CreateFromTextDialog.vue";
import PictureBankDialog from "@/frontend/components/EditorView/PictureBank/PictureBankDialog.vue";
import NewFileDialog from "@/frontend/components/EditorView/NewFileDialog.vue";
import TTSDialog from "@/frontend/components/EditorView/TTSDialog.vue";

import type { Card, PageMode, SetPage } from "@/common/interfaces/ConfigFile";
import { CardType, cloneCard, createPlaceholderCard, getMatchLane, normalizePage } from "@/common/interfaces/ConfigFile";
import { storageService } from "@/frontend/services/card-storage-service";
import { uuid } from "uuidv4";
import { TTS } from "@/frontend/utils/TTS";
import draggable from "vuedraggable";
import { Metric } from "@/frontend/utils/Metric";

const store = useStore();
const route = useRoute();

const newFileDialogShow = ref(false);
const selectedCardId = ref<string | null>(null);
const pendingMatchCardId = ref<string | null>(null);

onMounted(() => {
  if (route.params.path.toString().endsWith("new")) {
    newFileDialogShow.value = true;
  } else loadSet();

  Metric.registerEvent(store.state.pcHash, "openEditor");
});

const CardTypes = CardType;
const cardTypeOptions = [
  { text: "Обычная", value: 0 },
  { text: "Пробел", value: 1 },
  { text: "Пустая ", value: 2 },
  { text: "Новая карточка", value: 3 }
];

const ui_disabled = computed(() => store.state.ui.disabled);

const path = computed(() => route.params.path.toString());

const pages = computed({
  get (): SetPage[] {
    return store.state.editor.pages ?? [];
  },
  set (value: SetPage[]) {
    store.commit("editor_pages", value.map((page) => normalizePage(page)));
  }
});

const totalPages = computed(() => Math.max(1, pages.value.length || 0));

const page = computed({
  get (): number {
    return Math.max(0, Math.min(totalPages.value - 1, store.state.editor.page ?? 0));
  },
  set (value: number) {
    store.commit("editor_page", Math.max(0, Math.min(totalPages.value - 1, value)));
    selectedCardId.value = null;
    pendingMatchCardId.value = null;
  }
});

const currentPage = computed({
  get (): SetPage {
    return pages.value[page.value] ?? createEditorPage();
  },
  set (value: SetPage) {
    const nextPages = [...pages.value];
    nextPages[page.value] = normalizePage(value);
    pages.value = nextPages;
  }
});

const pageMode = computed({
  get (): PageMode {
    return currentPage.value.mode;
  },
  set (value: PageMode) {
    const next = normalizePage({
      ...currentPage.value,
      mode: value,
      rows: value === "match" ? 2 : currentPage.value.rows
    });
    currentPage.value = next;
    if (value !== "match") {
      pendingMatchCardId.value = null;
    }
  }
});

const columns = computed({
  get () {
    return currentPage.value.columns;
  },
  set (value: number) {
    currentPage.value = normalizePage({
      ...currentPage.value,
      columns: value
    });
  }
});

const rows = computed({
  get () {
    return currentPage.value.rows;
  },
  set (value: number) {
    currentPage.value = normalizePage({
      ...currentPage.value,
      rows: pageMode.value === "match" ? 2 : value
    });
  }
});

const current = computed({
  get (): Card[] {
    return currentPage.value.cards;
  },
  set (value: Card[]) {
    currentPage.value = {
      ...currentPage.value,
      cards: value
    };
  }
});

const question = computed({
  get (): string {
    return currentPage.value.question ?? "";
  },
  set (value: string) {
    currentPage.value = {
      ...currentPage.value,
      question: value
    };
  }
});

const filename = computed(() => store.state.editor.temp);

const selectedIndex = computed(() => current.value.findIndex((card) => card.id === selectedCardId.value));

const selected = computed<Card | null>(() => {
  if (selectedIndex.value === -1) return null;
  return current.value[selectedIndex.value] ?? null;
});

const selectedLane = computed(() => {
  if (selectedIndex.value === -1) return "top";
  return getMatchLane(selectedIndex.value, columns.value);
});

const linkedCard = computed(() => {
  if (!selected.value?.matchId) return null;
  return current.value.find((card) => card.id !== selected.value?.id && card.matchId === selected.value?.matchId) ?? null;
});

const matchButtonLabel = computed(() => {
  if (!selected.value) return "Выберите карточку";
  if (pendingMatchCardId.value === selected.value.id) return "Отменить выбор";
  if (pendingMatchCardId.value) return "Связать с выбранной карточкой";
  return "Выбрать карточку для связи";
});

watch(pageMode, (mode) => {
  if (mode !== "match") {
    pendingMatchCardId.value = null;
  }
});

const emptyPage = computed(() => {
  return current.value.every((card) => [CardType.NewCard, CardType.EmptyCard].includes(card.cardType));
});

function isValid (card: Card) {
  if (card.cardType === CardType.AudioCard) {
    if (!card.imagePath || !card.title) {
      return false;
    }
  }
  return true;
}

async function newFileName (text: string) {
  await store.dispatch("editor_new_file", path.value.slice(0, -3) + text);
  page.value = 0;
}

async function loadSet () {
  await store.dispatch("editor_current", path.value);
  page.value = 0;
}

function select (index: number) {
  selectedCardId.value = current.value[index]?.id ?? null;
}

function copySelected () {
  if (!selected.value) return;
  const placeholderIndex = current.value.findIndex((card) => card.cardType === CardType.NewCard);
  if (placeholderIndex === -1) return;

  const copiedCard = cloneCard(selected.value, true);
  const nextCards = [...current.value];
  nextCards.splice(selectedIndex.value + 1, 0, copiedCard);

  const removeIndex = findLastPlaceholder(nextCards);
  if (removeIndex !== -1) {
    nextCards.splice(removeIndex, 1);
  }

  current.value = nextCards;
  selectedCardId.value = copiedCard.id;
}

function copyPage () {
  store.dispatch("editor_copy_page");
  selectedCardId.value = null;
}

function deletePage () {
  store.dispatch("editor_delete_page");
  selectedCardId.value = null;
}

function nextPage () {
  if (page.value < totalPages.value - 1) {
    page.value++;
    return;
  }
  const nextPages = [...pages.value, createEditorPage(pageMode.value, columns.value, rows.value)];
  pages.value = nextPages;
  page.value = nextPages.length - 1;
}

function resetSelected () {
  if (!selected.value || selectedIndex.value === -1) return;
  const nextCards = [...current.value];
  nextCards[selectedIndex.value] = createPlaceholderCard();
  current.value = nextCards;
  selectedCardId.value = nextCards[selectedIndex.value].id;
}

async function selectImage () {
  if (!filename.value) return;
  store.dispatch("disable_ui");
  const id = await storageService.selectImage(filename.value);

  if (selected.value && selected.value.cardType === CardType.AudioCard) {
    selected.value.imagePath = id;
  }
  store.dispatch("enable_ui");
}

function onImageSelected (path: string) {
  if (!selected.value) return;
  selected.value.imagePath = path;
}

function onAudioFromTTS ({ audioSrcFile, audioText, audioVoice }: { audioSrcFile: string, audioText: string, audioVoice: string }) {
  if (!selected.value) throw new Error("Setting audio from TTSDialog to a nullish selected card");
  selected.value.audioPath = audioSrcFile;
  selected.value.audioText = audioText;
  selected.value.audioVoice = audioVoice;
}

async function selectAudio () {
  if (!filename.value) return;
  store.dispatch("disable_ui");
  const id = await storageService.selectAudio(filename.value);

  if (selected.value && selected.value.cardType === CardType.AudioCard && id) {
    selected.value.audioPath = id;
  }
  store.dispatch("enable_ui");
}

function playAudio () {
  if (filename.value && selected.value && selected.value.cardType === CardType.AudioCard) {
    TTS.instance.playCards(filename.value, [selected.value]);
  }
}

function onTitleSelected (title: string) {
  if (!selected.value) return;
  if (selected.value.title?.length && selected.value.title.length > 0) return;
  selected.value.title = title;
}

function toggleMatchLink () {
  if (!selected.value || pageMode.value !== "match") return;
  if (pendingMatchCardId.value === selected.value.id) {
    pendingMatchCardId.value = null;
    return;
  }
  if (!pendingMatchCardId.value) {
    pendingMatchCardId.value = selected.value.id;
    return;
  }

  const pendingIndex = current.value.findIndex((card) => card.id === pendingMatchCardId.value);
  const pendingCard = current.value[pendingIndex];
  if (!pendingCard) {
    pendingMatchCardId.value = selected.value.id;
    return;
  }

  const pendingLane = getMatchLane(pendingIndex, columns.value);
  if (pendingLane === selectedLane.value) {
    pendingMatchCardId.value = selected.value.id;
    return;
  }

  const matchId = selected.value.matchId ?? pendingCard.matchId ?? uuid();
  selected.value.matchId = matchId;
  pendingCard.matchId = matchId;
  pendingMatchCardId.value = null;
}

function clearMatchLink () {
  if (!selected.value?.matchId) return;
  const matchId = selected.value.matchId;
  current.value.forEach((card) => {
    if (card.matchId === matchId) {
      delete card.matchId;
    }
  });
  pendingMatchCardId.value = null;
}

function createEditorPage (mode: PageMode = "standard", pageColumns = 3, pageRows = 3): SetPage {
  return normalizePage({
    mode,
    columns: pageColumns,
    rows: mode === "match" ? 2 : pageRows,
    cards: [createPlaceholderCard()]
  });
}

function findLastPlaceholder (cards: Card[]) {
  for (let index = cards.length - 1; index >= 0; index--) {
    if (cards[index].cardType === CardType.NewCard) {
      return index;
    }
  }
  return -1;
}
</script>

<style scoped>
.editor {
  height: calc(100vh - 104px);
  padding: 10px;
}

.editor-body {
  height: 100%;
  display: grid;
  grid-template-columns: 8fr 4fr;
}

.cards {
  height: 60%;
  display: grid;
  grid-template-rows: repeat(var(--rows), 1fr);
  grid-template-columns: repeat(var(--columns), 1fr);
}

.cards-wrapper {
  height: 100%;
}

.buttons {
  position: absolute;
  bottom: 0;
  width: 100%;
}

.selected {
  background: yellow !important;
  border: 1px solid yellow;
}

.nonValid {
  border: 3px solid red;
}

.pendingMatch {
  border: 3px dashed rgb(var(--v-theme-primary));
}

.delete {
  position: absolute;
  right: 0;
  top: 0;
}

.copy {
  position: absolute;
  right: 40px;
  top: 0;
}

.match-hint {
  font-size: 14px;
  opacity: 0.75;
}

.mb-2 {
  margin-bottom: 8px;
}
</style>
