<template>
  <div fluid class="editor">
    <new-file-dialog :show="newFileDialogShow" :disabled="ui_disabled" @text="newFileName" />
    <v-dialog v-model="audioOverwriteDialog" max-width="420">
      <v-card>
        <v-card-title>Заменить озвучку?</v-card-title>
        <v-card-text>
          На выбранной карточке уже есть озвучка. Заменить её скопированной?
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="audioOverwriteDialog = false">Отмена</v-btn>
          <v-btn color="primary" @click="pasteCopiedAudio">Заменить</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-snackbar v-model="audioNotificationVisible" :timeout="3000">
      {{ audioNotification }}
      <template #actions>
        <v-btn variant="text" @click="audioNotificationVisible = false">Закрыть</v-btn>
      </template>
    </v-snackbar>
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
            Связывайте карточки попарно: выберите карточку сверху и снизу. Повторные связи
            объединяют группы; каждая карточка сверху должна быть связана со всеми подходящими
            карточками снизу.
          </div>
        </v-card-text>
        <v-card-text class="cards-wrapper">
          <draggable
            v-model="current"
            item-key="id"
            class="cards"
            :style="{
              '--rows': pageMode === 'match' ? 2 : rows,
              '--columns': pageMode === 'match' ? matchGridColumns : columns
            }"
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
                  pendingMatch: pendingMatchCardId === element.id,
                  mergedCovered: isPlacementCovered(index),
                  mergedCard: isMergedCard(index)
                }"
                :style="getCardStyle(index)"
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
      <v-card v-if="selected" class="editor-side-panel editor-side-panel--selected mt-7">
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
            <v-row v-if="showMergeControls">
              <v-col>
                <v-card width="100%" elevation="0" class="span-settings">
                  <v-card-title primary-title> Размер карточки </v-card-title>
                  <v-card-subtitle> Сейчас: {{ cardSpanLabel }} </v-card-subtitle>
                  <v-card-text>
                    <v-container>
                      <v-row>
                        <v-col>
                          <v-btn
                            block
                            color="primary"
                            :disabled="ui_disabled || !cardSpanInfo.canFillRow"
                            @click="mergeFullRow"
                          >
                            {{ cardSpanInfo.canFillRow ? "Объединить строку" : "Строка занята" }}
                          </v-btn>
                        </v-col>
                      </v-row>
                      <v-row>
                        <v-col>
                          <v-btn
                            block
                            variant="tonal"
                            :disabled="ui_disabled || !cardSpanInfo.canGrowRight"
                            @click="growRight"
                          >
                            {{ cardSpanInfo.canGrowRight ? "+ вправо" : "Справа занято" }}
                          </v-btn>
                        </v-col>
                        <v-col>
                          <v-btn
                            block
                            variant="tonal"
                            :disabled="ui_disabled || !cardSpanInfo.canGrowDown"
                            @click="growDown"
                          >
                            {{ cardSpanInfo.canGrowDown ? "+ вниз" : "Снизу занято" }}
                          </v-btn>
                        </v-col>
                      </v-row>
                      <v-row>
                        <v-col>
                          <v-btn
                            block
                            color="error"
                            variant="tonal"
                            :disabled="ui_disabled || !cardSpanInfo.canReset"
                            @click="resetSpan"
                          >
                            Сбросить до 1×1
                          </v-btn>
                        </v-col>
                      </v-row>
                    </v-container>
                  </v-card-text>
                </v-card>
              </v-col>
            </v-row>
            <section v-if="selected.cardType === CardTypes.AudioCard">
              <v-row>
                <v-col>
                  <v-text-field
                    v-model="selected.title"
                    outline
                    label="Название карточки"
                    max-length="30"
                    :disabled="ui_disabled"
                  />
                </v-col>
              </v-row>
              <v-row>
                <v-card width="100%" elevation="0">
                  <v-card-title primary-title> Работа с изображением </v-card-title>
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
                        <picture-bank-dialog
                          block
                          :file="filename"
                          @image="onImageSelected"
                          @name="onTitleSelected"
                        />
                      </v-row>
                    </v-container>
                  </v-card-text>
                </v-card>
              </v-row>
              <v-row>
                <v-card width="100%" elevation="0">
                  <v-card-title primary-title> Работа с озвучкой </v-card-title>
                  <v-card-subtitle>
                    {{
                      selected.audioText ??
                      (selected.audioPath ? ".mp3 файл добавлен" : "Добавьте текст или .mp3 файл!")
                    }}
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
                      <v-row>
                        <v-col>
                          <v-btn
                            block
                            :disabled="ui_disabled || !selected.audioPath"
                            @click="copyAudio"
                          >
                            <v-icon start>mdi-content-copy</v-icon>
                            Копировать озвучку
                          </v-btn>
                        </v-col>
                        <v-col>
                          <v-btn
                            block
                            color="primary"
                            :disabled="ui_disabled || !canPasteAudio"
                            @click="requestPasteAudio"
                          >
                            <v-icon start>mdi-content-paste</v-icon>
                            Вставить озвучку
                          </v-btn>
                        </v-col>
                      </v-row>
                      <v-row>
                        <div class="audio-copy-hint">
                          {{ audioCopyHint }}
                        </div>
                      </v-row>
                      <v-row v-if="selected.audioPath">
                        <v-col>
                          <v-btn block :disabled="ui_disabled" @click="playAudio">
                            Послушать озвучку
                          </v-btn>
                        </v-col>
                        <v-col>
                          <v-btn block color="error" :disabled="ui_disabled" @click="clearAudio">
                            Удалить озвучку
                          </v-btn>
                        </v-col>
                      </v-row>
                    </v-container>
                  </v-card-text>
                </v-card>
              </v-row>
              <v-row>
                <v-card v-if="pageMode === 'quiz'" width="100%">
                  <v-card-title primary-title> Работа с викториной </v-card-title>
                  <v-card-text>
                    <v-container>
                      <v-checkbox v-model="selected.answer" label="Отметить как правильный ответ" />
                    </v-container>
                  </v-card-text>
                </v-card>
                <v-card v-else-if="pageMode === 'match'" width="100%">
                  <v-card-title primary-title> Работа со связями </v-card-title>
                  <v-card-text>
                    <v-container>
                      <div class="mb-2">
                        Строка: {{ selectedLane === "top" ? "верхняя" : "нижняя" }}
                      </div>
                      <div class="mb-2" v-if="linkedCards.length">
                        Связана с:
                        {{ linkedCards.map((card) => card.title || "без названия").join(", ") }}
                      </div>
                      <div class="mb-2" v-else>Связь не задана</div>
                      <v-btn block color="primary" class="mb-2" @click="toggleMatchLink">
                        {{ matchButtonLabel }}
                      </v-btn>
                      <v-btn
                        block
                        color="error"
                        :disabled="!selected.matchId"
                        @click="clearMatchLink"
                      >
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
      <v-card v-else class="editor-side-panel">
        <v-card-title primary-title> Выберите картинку для начала работы </v-card-title>
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

import type { Card, CardGridPlacement, PageMode, SetPage } from "@/common/interfaces/ConfigFile";
import {
  CardType,
  getCardGridPlacements,
  getMatchLane,
  normalizePage
} from "@/common/interfaces/ConfigFile";
import { storageService } from "@/frontend/services/card-storage-service";
import { TTS } from "@/frontend/utils/TTS";
import draggable from "vuedraggable";
import { Telemetry } from "@/frontend/utils/Telemetry";
import {
  advanceEditorPage,
  applyCardAudio,
  clearCardAudio,
  clearMatchLink as clearEditorMatchLink,
  copyCardAudio,
  copySelectedCard,
  createEditorPage,
  getSelectedCardSpanInfo,
  growSelectedCardDown,
  growSelectedCardRight,
  isValidEditorCard,
  isValidMatchCard,
  mergeSelectedCardFullRow,
  resetSelectedCardSpan,
  resetSelectedCard,
  toggleMatchLink as toggleEditorMatchLink
} from "@/frontend/utils/editorLogic";

const store = useStore();
const route = useRoute();

const newFileDialogShow = ref(false);
const selectedCardId = ref<string | null>(null);
const pendingMatchCardId = ref<string | null>(null);
const copiedAudio = ref<{
  sourceCardId: string;
  sourceTitle: string;
  audioPath: string;
  audioText?: string;
  audioVoice?: string;
} | null>(null);
const audioOverwriteDialog = ref(false);
const audioNotification = ref("");
const audioNotificationVisible = ref(false);

onMounted(() => {
  if (route.params.path.toString().endsWith("new")) {
    newFileDialogShow.value = true;
  } else loadSet();

  Telemetry.product("openEditor");
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
  get(): SetPage[] {
    return store.state.editor.pages ?? [];
  },
  set(value: SetPage[]) {
    store.commit(
      "editor_pages",
      value.map((page) => normalizePage(page))
    );
  }
});

const totalPages = computed(() => Math.max(1, pages.value.length || 0));

const page = computed({
  get(): number {
    return Math.max(0, Math.min(totalPages.value - 1, store.state.editor.page ?? 0));
  },
  set(value: number) {
    store.commit("editor_page", Math.max(0, Math.min(totalPages.value - 1, value)));
    selectedCardId.value = null;
    pendingMatchCardId.value = null;
  }
});

const currentPage = computed({
  get(): SetPage {
    return pages.value[page.value] ?? createEditorPage();
  },
  set(value: SetPage) {
    const nextPages = [...pages.value];
    nextPages[page.value] = normalizePage(value);
    pages.value = nextPages;
  }
});

const pageMode = computed({
  get(): PageMode {
    return currentPage.value.mode;
  },
  set(value: PageMode) {
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
  get() {
    return currentPage.value.columns;
  },
  set(value: number) {
    currentPage.value = normalizePage({
      ...currentPage.value,
      columns: value
    });
  }
});

const topColumns = computed(() => currentPage.value.topColumns ?? currentPage.value.columns);
const bottomColumns = computed(() => currentPage.value.bottomColumns ?? currentPage.value.columns);
const matchGridColumns = computed(() =>
  Math.max(topColumns.value, bottomColumns.value, current.value.length - topColumns.value, 1)
);

const rows = computed({
  get() {
    return currentPage.value.rows;
  },
  set(value: number) {
    currentPage.value = normalizePage({
      ...currentPage.value,
      rows: pageMode.value === "match" ? 2 : value
    });
  }
});

const current = computed({
  get(): Card[] {
    return currentPage.value.cards;
  },
  set(value: Card[]) {
    currentPage.value = {
      ...currentPage.value,
      cards: value
    };
  }
});

const placements = computed(() => getCardGridPlacements(currentPage.value));

const question = computed({
  get(): string {
    return currentPage.value.question ?? "";
  },
  set(value: string) {
    currentPage.value = {
      ...currentPage.value,
      question: value
    };
  }
});

const filename = computed(() => store.state.editor.temp);

const selectedIndex = computed(() =>
  current.value.findIndex((card) => card.id === selectedCardId.value)
);

const selected = computed<Card | null>(() => {
  if (selectedIndex.value === -1) return null;
  return current.value[selectedIndex.value] ?? null;
});

const canPasteAudio = computed(() => {
  return !!copiedAudio.value && copiedAudio.value.sourceCardId !== selected.value?.id;
});

const audioCopyHint = computed(() => {
  if (!copiedAudio.value) return "Скопируйте озвучку, затем выберите другую карточку.";
  return `Скопировано из карточки: ${copiedAudio.value.sourceTitle}`;
});

const selectedLane = computed(() => {
  if (selectedIndex.value === -1) return "top";
  return getMatchLane(selectedIndex.value, topColumns.value);
});

const linkedCards = computed(() => {
  if (!selected.value?.matchId) return [];
  return current.value.filter(
    (card) => card.id !== selected.value?.id && card.matchId === selected.value?.matchId
  );
});

const matchButtonLabel = computed(() => {
  if (!selected.value) return "Выберите карточку";
  if (pendingMatchCardId.value === selected.value.id) return "Отменить выбор";
  if (pendingMatchCardId.value) return "Связать с выбранной карточкой";
  return "Выбрать карточку для связи";
});

const cardSpanInfo = computed(() => {
  return getSelectedCardSpanInfo(
    current.value,
    selectedCardId.value,
    columns.value,
    rows.value,
    pageMode.value
  );
});

const showMergeControls = computed(() => {
  return cardSpanInfo.value.mergeable;
});

const cardSpanLabel = computed(() => {
  return `${cardSpanInfo.value.currentWidth}×${cardSpanInfo.value.currentHeight}`;
});

watch(pageMode, (mode) => {
  if (mode !== "match") {
    pendingMatchCardId.value = null;
  }
});

const emptyPage = computed(() => {
  return current.value.every((card) =>
    [CardType.NewCard, CardType.EmptyCard].includes(card.cardType)
  );
});

function isValid(card: Card) {
  if (pageMode.value === "match") {
    const index = current.value.findIndex((item) => item.id === card.id);
    return (
      index < topColumns.value + bottomColumns.value &&
      isValidEditorCard(card) &&
      isValidMatchCard(card, current.value, topColumns.value, bottomColumns.value)
    );
  }
  return isValidEditorCard(card);
}

function cardPosition(index: number) {
  if (pageMode.value !== "match") return undefined;
  const top = index < topColumns.value;
  return {
    gridRow: top ? 1 : 2,
    gridColumn: top ? index + 1 : index - topColumns.value + 1
  };
}

async function newFileName(text: string) {
  await store.dispatch("editor_new_file", path.value.slice(0, -3) + text);
  page.value = 0;
}

async function loadSet() {
  await store.dispatch("editor_current", path.value);
  page.value = 0;
}

function select(index: number) {
  if (isPlacementCovered(index)) return;
  selectedCardId.value = current.value[index]?.id ?? null;
}

function getPlacement(index: number): CardGridPlacement | undefined {
  return placements.value[index];
}

function getPlacementStyle(index: number) {
  const placement = getPlacement(index);
  if (!placement) return undefined;
  return {
    gridColumn: `${placement.column} / span ${placement.width}`,
    gridRow: `${placement.row} / span ${placement.height}`,
    zIndex: placement.covered ? 0 : 1
  };
}

function getCardStyle(index: number) {
  return pageMode.value === "match" ? cardPosition(index) : getPlacementStyle(index);
}

function isPlacementCovered(index: number) {
  return !!getPlacement(index)?.covered;
}

function isMergedCard(index: number) {
  const placement = getPlacement(index);
  return !!placement && !placement.covered && (placement.width > 1 || placement.height > 1);
}

function copySelected() {
  const result = copySelectedCard(current.value, selectedCardId.value);
  current.value = result.cards;
  selectedCardId.value = result.selectedCardId;
}

function copyPage() {
  store.dispatch("editor_copy_page");
  selectedCardId.value = null;
}

function deletePage() {
  store.dispatch("editor_delete_page");
  selectedCardId.value = null;
}

function nextPage() {
  const result = advanceEditorPage(pages.value, page.value);
  pages.value = result.pages;
  page.value = result.page;
}

function resetSelected() {
  const result = resetSelectedCard(current.value, selectedCardId.value);
  current.value = result.cards;
  selectedCardId.value = result.selectedCardId;
}

function growRight() {
  applySpanResult(
    growSelectedCardRight(
      current.value,
      selectedCardId.value,
      columns.value,
      rows.value,
      pageMode.value
    )
  );
}

function growDown() {
  applySpanResult(
    growSelectedCardDown(
      current.value,
      selectedCardId.value,
      columns.value,
      rows.value,
      pageMode.value
    )
  );
}

function mergeFullRow() {
  applySpanResult(
    mergeSelectedCardFullRow(
      current.value,
      selectedCardId.value,
      columns.value,
      rows.value,
      pageMode.value
    )
  );
}

function resetSpan() {
  applySpanResult(resetSelectedCardSpan(current.value, selectedCardId.value));
}

function applySpanResult(result: { cards: Card[]; selectedCardId: string | null }) {
  current.value = result.cards;
  selectedCardId.value = result.selectedCardId;
}

async function selectImage() {
  if (!filename.value) return;
  store.dispatch("disable_ui");
  try {
    const id = await storageService.selectImage(filename.value);

    if (id && selected.value && selected.value.cardType === CardType.AudioCard) {
      selected.value.imagePath = id;
    }
  } catch (error) {
    console.error(error);
  } finally {
    store.dispatch("enable_ui");
  }
}

function onImageSelected(path: string) {
  if (!selected.value) return;
  selected.value.imagePath = path;
}

function onAudioFromTTS({
  audioSrcFile,
  audioText,
  audioVoice
}: {
  audioSrcFile: string;
  audioText: string;
  audioVoice: string;
}) {
  if (!selected.value) throw new Error("Setting audio from TTSDialog to a nullish selected card");
  selected.value.audioPath = audioSrcFile;
  selected.value.audioText = audioText;
  selected.value.audioVoice = audioVoice;
}

async function selectAudio() {
  if (!filename.value) return;
  store.dispatch("disable_ui");
  try {
    const id = await storageService.selectAudio(filename.value);

    if (selected.value && selected.value.cardType === CardType.AudioCard && id) {
      const next = clearCardAudio(selected.value);
      next.audioPath = id;
      replaceSelected(next);
    }
  } catch (error) {
    console.error(error);
  } finally {
    store.dispatch("enable_ui");
  }
}

function playAudio() {
  if (filename.value && selected.value && selected.value.cardType === CardType.AudioCard) {
    TTS.instance.playCards(filename.value, [selected.value]);
  }
}

function clearAudio() {
  if (!selected.value || selected.value.cardType !== CardType.AudioCard) return;
  replaceSelected(clearCardAudio(selected.value));
}

function copyAudio() {
  if (!selected.value) return;
  const audio = copyCardAudio(selected.value);
  if (!audio) return;
  copiedAudio.value = {
    ...audio,
    sourceCardId: selected.value.id,
    sourceTitle: selected.value.title || "без названия"
  };
  showAudioNotification(`Озвучка карточки «${copiedAudio.value.sourceTitle}» скопирована`);
}

function requestPasteAudio() {
  if (!canPasteAudio.value || !selected.value) return;
  if (selected.value.audioPath) {
    audioOverwriteDialog.value = true;
    return;
  }
  pasteCopiedAudio();
}

function pasteCopiedAudio() {
  if (!canPasteAudio.value || !selected.value || !copiedAudio.value) return;
  replaceSelected(applyCardAudio(selected.value, copiedAudio.value));
  audioOverwriteDialog.value = false;
  showAudioNotification("Озвучка вставлена");
}

function showAudioNotification(message: string) {
  audioNotification.value = message;
  audioNotificationVisible.value = true;
}

function replaceSelected(card: Card) {
  if (selectedIndex.value === -1) return;
  const nextCards = [...current.value];
  nextCards[selectedIndex.value] = card;
  current.value = nextCards;
}

function onTitleSelected(title: string) {
  if (!selected.value) return;
  if (selected.value.title?.length && selected.value.title.length > 0) return;
  selected.value.title = title;
}

function toggleMatchLink() {
  if (pageMode.value !== "match") return;
  const result = toggleEditorMatchLink(
    current.value,
    selectedCardId.value,
    pendingMatchCardId.value,
    topColumns.value
  );
  current.value = result.cards;
  pendingMatchCardId.value = result.pendingMatchCardId;
}

function clearMatchLink() {
  const result = clearEditorMatchLink(current.value, selectedCardId.value);
  current.value = result.cards;
  pendingMatchCardId.value = result.pendingMatchCardId;
}
</script>

<style scoped>
.editor {
  height: calc(100vh - 104px);
  padding: 10px;
}

.editor-body {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: 8fr 4fr;
}

.editor-side-panel {
  height: 100%;
  min-height: 0;
  overflow-y: auto;
}

.editor-side-panel--selected {
  height: calc(100% - 28px);
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

.mergedCovered {
  pointer-events: none;
  visibility: hidden;
}

.mergedCard {
  box-shadow: inset 0 0 0 4px rgb(var(--v-theme-primary));
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

.audio-copy-hint {
  font-size: 14px;
  opacity: 0.75;
  padding: 0 12px;
}
</style>
