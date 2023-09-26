<template>
  <div
    fluid
    class="editor"
  >
    <new-file-dialog
      :show="newFileDialogShow"
      @text="newFileName"
    />
    <div class="editor-body">
      <v-card
        v-if="filename"
        xs8
        fill-height
        fluid
      >
        <v-card-title> Карточки </v-card-title>
        <v-card-text>
          <v-text-field
            v-if="isQuiz"
            v-model="questions[page]"
            label="Введите вопрос для этой страницы"
          />
        </v-card-text>
        <v-card-text class="cards-wrapper">
          <draggable
            v-model="current"
            item-key="id"
            class="cards"
            :style="{ '--rows': rows, '--columns': columns }"
          >
            <template #item="{ element, index }">
              <set-grid-button
                :key="element.id"
                :file="filename"
                :card="element"
                :enabled="false"
                :class="{
                  selected: selected?.id === element?.id,
                  nonValid: !isValid(element)
                }"
                :dot="!!element.answer"
                @click="select(index)"
              />
            </template>
          </draggable>
        </v-card-text>
        <v-card-text class="buttons">
          <v-layout>
            <v-row>
              <v-col xs4>
                <v-btn
                  block
                  color="orange"
                  @click="page--"
                >
                  <v-icon>mdi-arrow-left</v-icon>
                </v-btn>
              </v-col>
              <v-col xs4>
                <v-btn
                  block
                  color="blue"
                  disabled
                >
                  {{ page + 1 }}
                </v-btn>
              </v-col>
              <v-col xs4>
                <v-btn
                  block
                  color="orange"
                  :disabled="emptyPage"
                  @click="page++"
                >
                  <v-icon>mdi-arrow-right</v-icon>
                </v-btn>
              </v-col>
            </v-row>
          </v-layout>
        </v-card-text>
      </v-card>
      <v-card v-if="selected">
        <v-btn
          v-if="selected.cardType != 3"
          title="Сбросить карточку"
          icon
          absolute
          color="error"
          class="delete"
          @click="selected.cardType = 3"
        >
          <v-icon>mdi-delete</v-icon>
        </v-btn>
        <v-card-title primary-title>
          Редактировать карточку
        </v-card-title>
        <v-card-text>
          <v-form>
            <v-row>
              <v-select
                v-model="selected.cardType"
                :items="cardTypes"
                label="Тип карточки"
                item-title="text"
                item-value="value"
              />
            </v-row>
            <section v-if="selected.cardType == 0">
              <v-row>
                <v-text-field
                  v-model="selected.title"
                  outline
                  label="Название карточки"
                  max-length="30"
                />
              </v-row>
              <v-row>
                <v-card width="100%">
                  <v-card-title primary-title>
                    Работа с изображением
                  </v-card-title>
                  <v-card-text>
                    <v-container>
                      <v-row>
                        <v-btn
                          block
                          @click="selectImage"
                        >
                          Выбрать картинку
                        </v-btn>
                      </v-row>
                      <v-row>
                        <create-from-text-dialog
                          block
                          :file="filename"
                          @image="(path: string) => (selected.imagePath = path)"
                        />
                      </v-row>
                    </v-container>
                  </v-card-text>
                </v-card>
              </v-row>
              <v-row>
                <v-card width="100%">
                  <v-card-title primary-title>
                    Работа с озвучкой
                  </v-card-title>
                  <v-card-text>
                    <v-container>
                      <v-row>
                        <TTSDialog
                          :file="filename"
                          @audio="(src: string) => (selected.audioPath = src)"
                        />
                      </v-row>
                      <v-row>
                        <v-btn
                          block
                          @click="selectAudio"
                        >
                          Выбрать звук из файла
                        </v-btn>
                      </v-row>
                      <v-row v-if="selected.audioPath">
                        <v-btn
                          block
                          @click="playAudio"
                        >
                          Послушать озвучку
                        </v-btn>
                      </v-row>
                    </v-container>
                  </v-card-text>
                </v-card>
              </v-row>
              <v-row>
                <v-card
                  v-if="isQuiz"
                  width="100%"
                >
                  <v-card-title primary-title>
                    Работа с викториной
                  </v-card-title>
                  <v-card-text>
                    <v-container>
                      <v-checkbox
                        v-model="selected.answer"
                        label="Отметить как правильный ответ"
                      />
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
import type { Ref } from "vue";
import { ref, computed, onMounted } from "vue";
import { useStore } from "vuex";
import { useRoute } from "vue-router";

import SetGridButton from "@/frontend/components/SetGridButton.vue";
import CreateFromTextDialog from "@/frontend/components/EditorView/CreateFromTextDialog.vue";
import NewFileDialog from "@/frontend/components/EditorView/NewFileDialog.vue";
import TTSDialog from "@/frontend/components/EditorView/TTSDialog.vue";

import type { Card, NewCard } from "@/common/interfaces/ConfigFile";
import { storageService } from "@/frontend/services/card-storage-service";
import { uuid } from "uuidv4";
import { TTS } from "@/frontend/utils/TTS";
import draggable from "vuedraggable";
import { Metric } from "@/frontend/utils/Metric";

const store = useStore();
const route = useRoute();

const newFileDialogShow = ref(false);

onMounted(() => {
  if (route.params.path.toString().endsWith("new")) {
    newFileDialogShow.value = true;
  } else loadSet();

  Metric.registerEvent(store.state.pcHash, "openEditor");
});

const cardTypes = [
  { text: "Обычная", value: 0 },
  { text: "Пустая ", value: 2 },
  { text: "Пробел", value: 1 },
  { text: "Новая карточка", value: 3 }
];

const mcurrent: Ref<(Card | NewCard)[]> = ref([]);
const mpage = ref(0);
const selected: Ref<Card | NewCard | null> = ref(null);

const path = computed(() => {
  return route.params.path.toString();
});

const columns = computed({
  get () {
    return store.state.editor.columns;
  },
  set (v: number) {
    store.commit("editor_columns", v);
    onColumns();
  }
});

const rows = computed({
  get () {
    return store.state.editor.rows;
  },
  set (v: number) {
    store.commit("editor_rows", v);
    onRows();
  }
});

const cards = computed({
  get () {
    return store.state.editor.cards;
  },
  set (v: (Card | NewCard)[]) {
    console.log("commiting to store:", v);
    store.commit("editor_cards", v);
  }
});

const filename = computed(() => {
  return store.state.editor.temp;
});

const current = computed({
  get (): (Card | NewCard)[] {
    return mcurrent.value;
  },
  set (v: (Card | NewCard)[]) {
    if (v.length === mcurrent.value.length) {
      const cids = mcurrent.value.map(({ id }) => id.toString()).reduce((a, b) => a + b);
      const nids = v.map(({ id }) => id.toString()).reduce((a, b) => a + b);
      mcurrent.value = v;

      if (cids !== nids) {
        for (let index = 0; index < v.length; index++) {
          const element = v[index];
          cards.value[pageSize.value * page.value + index] = element;
        }
      }
    } else {
      mcurrent.value = v;
    }
  }
});

const isWithoutSpace = computed({
  get (): boolean {
    return store.state.editor.isWithoutSpace;
  },
  set (v: boolean) {
    store.commit("editor_isWithoutSpace", v);
  }
});

const isDirectSet = computed({
  get (): boolean {
    return store.state.editor.isDirectSet;
  },
  set (v: boolean) {
    store.commit("editor_isDirectSet", v);
  }
});

const isQuiz = computed({
  get (): boolean {
    return store.state.editor.quiz;
  },
  set (v: boolean) {
    store.commit("editor_isQuiz", v);
  }
});

const pageSize = computed(() => {
  return columns.value * rows.value;
});

const page = computed({
  get (): number {
    return mpage.value;
  },
  set (v: number) {
    mpage.value = Math.max(0, v);
    selected.value = null;
    if (!cards.value) return;
    const arr = cards.value?.slice(pageSize.value * page.value, pageSize.value * (page.value + 1));
    for (let i = 0; i < arr.length; i++) {
      const element = arr[i];
      if (!element) {
        arr[i] = getNewCard();
      }
    }

    while (arr.length < pageSize.value) {
      arr.push(getNewCard());
    }
    current.value = arr;
  }
});

const emptyPage = computed(() => {
  for (const card of current.value) {
    if (card.cardType !== 3) return false;
  }
  return true;
});

const questions = computed(() => {
  return store.state.editor.questions;
});

function isValid (card: Card) {
  if (card.cardType === 0) {
    if (!card.imagePath || !card.imagePath || !card.title) {
      return false;
    }
  }
  return true;
}

function onRows () {
  page.value = 0;
}

function onColumns () {
  page.value = 0;
}

async function newFileName (text: string) {
  await store.dispatch("editor_new_file", path.value.slice(0, -3) + text);
  page.value = 0;
}

async function loadSet () {
  await store.dispatch("editor_current", path);
  page.value = 0;
}

function select (index: number) {
  let card = cards.value[pageSize.value * page.value + index];
  if (!card) {
    // TODO: plz fix, dont create nullish elements in the array
    card = cards.value[pageSize.value * page.value + index] = current.value[index];
    for (let i = 0; i < pageSize.value * page.value + index; i++) {
      if (!cards.value[i]) {
        cards.value[i] = getNewCard();
      }
    }
  }
  selected.value = card;
}

function getNewCard (): NewCard {
  return {
    cardType: 3,
    id: uuid()
  };
}

async function selectImage () {
  if (!filename.value) return;
  const id = await storageService.selectImage(filename.value);

  if (selected.value && selected.value.cardType === 0) {
    selected.value.imagePath = id;
  }
}

async function selectAudio () {
  if (!filename.value) return;
  const id = await storageService.selectAudio(filename.value);

  if (selected.value && selected.value.cardType === 0 && id) {
    selected.value.audioPath = id;
  }
}

function playAudio () {
  if (filename.value && selected.value && selected.value.cardType == 0) {
    TTS.instance.playCards(filename.value, [selected.value]);
  }
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

.delete {
  position: absolute;
  right: 0;
  top: 0;
}
</style>
