<template>
  <div fluid class="editor">
    <v-card fill-height>
      <v-card-title primary-title> Настройки набора </v-card-title>
      <v-card-text>
        <v-form>
          <v-row>
            <v-col xs8>
              <v-row>
                <v-col xs12 md6>
                  <v-text-field
                    label="Количество строк"
                    type="number"
                    :min="1"
                    v-model="columns"
                  ></v-text-field>
                </v-col>
                <v-col xs12 md6>
                  <v-text-field
                    label="Количество колонок"
                    small
                    :min="1"
                    type="number"
                    v-model="rows"
                  ></v-text-field>
                </v-col>
              </v-row>
            </v-col>
            <v-col xs4>
              <v-row>
                <v-checkbox
                  label="Набор для печати текста"
                  v-model="isWithoutSpace"
                ></v-checkbox>
                <v-checkbox
                  label="Рекомендовать скрыть строку вывода при работе с набором"
                  v-model="isDirectSet"
                ></v-checkbox>
              </v-row>
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>
    </v-card>
    <div class="editor-body">
      <v-card xs8 fill-height fluid v-if="config">
        <v-card-title> Карточки </v-card-title>
        <v-card-text class="cards-wrapper">
          <div class="cards" :style="{ '--rows': rows, '--columns': columns }">
            <set-grid-button
              v-for="(card, i) in current"
              :key="card.id"
              :file="filename"
              :card="card"
              :enabled="false"
              :class="{
                selected: selected?.id === card?.id,
                nonValid: !isValid(card),
              }"
              @click="select(i)"
            />
          </div>
        </v-card-text>
        <v-card-text class="buttons">
          <v-layout>
            <v-row>
              <v-col xs4>
                <v-btn block color="orange" @click="page--">
                  <v-icon>mdi-arrow-left</v-icon>
                </v-btn>
              </v-col>
              <v-col xs4>
                <v-btn block color="blue" disabled>
                  {{ page + 1 }}
                </v-btn>
              </v-col>
              <v-col xs4>
                <v-btn
                  block
                  color="orange"
                  @click="page++"
                  :disabled="emptyPage"
                >
                  <v-icon>mdi-arrow-right</v-icon>
                </v-btn>
              </v-col>
            </v-row>
          </v-layout>
        </v-card-text>
      </v-card>
      <v-card v-if="selected">
        <v-card-title primary-title> Редактировать карточку </v-card-title>
        <v-card-text>
          <v-form>
            <v-row>
              <v-select
                :items="cardTypes"
                v-model="selected.cardType"
                label="Тип карточки"
                item-title="text"
                item-value="value"
              ></v-select>
            </v-row>
            <section v-if="selected.cardType == 0">
              <v-row>
                <v-text-field
                  outline
                  label="Название карточки"
                  v-model="selected.title"
                ></v-text-field>
              </v-row>
              <v-row>
                <v-card width="100%">
                  <v-card-title primary-title>
                    Работа с изображением
                  </v-card-title>
                  <v-card-text>
                    <v-container>
                      <v-row>
                        <v-btn block @click="selectImage">
                          Выбрать картинку
                        </v-btn>
                      </v-row>
                      <v-row>
                        <create-from-text-dialog
                          block
                          :file="filename"
                          @image="(path) => (selected.imagePath = path)"
                        />
                      </v-row>
                    </v-container>
                  </v-card-text>
                </v-card>
              </v-row>
              <v-row>
                <v-card width="100%">
                  <v-card-title primary-title> Работа с озвучкой </v-card-title>
                  <v-card-text>
                    <v-container>
                      <v-row>
                        <tts-dialog
                          :file="filename"
                          @audio="(src) => (selected.audioPath = src)"
                        />
                      </v-row>
                      <v-row v-if="selected.audioPath">
                        <v-btn block @click="playAudio"
                          >Послушать озвучку</v-btn
                        >
                      </v-row>
                    </v-container>
                  </v-card-text>
                </v-card>
              </v-row>
            </section>
          </v-form>
        </v-card-text>
      </v-card>
    </div>
  </div>
</template>

<script lang="ts">
import { Vue, prop, Options } from "vue-class-component";
import SetGridButton from "@/components/SetGridButton.vue";
import CreateFromTextDialog from "@/components/EditorView/CreateFromTextDialog.vue";
import TTSDialog from "@/components/EditorView/TTSDialog.vue";
import { Card, ConfigFile, NewCard } from "@/interfaces/ConfigFile";
import { storageService } from "@/CardsStorage/frontend";
import { uuid } from "uuidv4";
import { TTS } from "@/utils/TTS";

class Props {}

@Options({
  components: {
    SetGridButton,
    CreateFromTextDialog,
    "tts-dialog": TTSDialog,
  },
  watch: {
    columns: "onColumns",
    rows: "onRows",
  },
})
export default class EditorView extends Vue.with(Props) {
  columns = 3;
  rows = 3;
  mpage = 0;
  file = [];
  cards = [] as (Card | NewCard)[];
  filename: string | null = null;
  config: ConfigFile | null = null;
  selected: Card | NewCard | null = null;

  cardTypes = [
    { text: "Обычная", value: 0 },
    { text: "Пустая ", value: 2 },
    { text: "Пробел", value: 1 },
    { text: "Новая карточка", value: 3 },
  ];
  current: (Card | NewCard)[] = [];
  isWithoutSpace = false;
  isDirectSet = false;

  get pageSize(): number {
    return this.columns * this.rows;
  }

  public get page(): number {
    return this.mpage;
  }
  public set page(v: number) {
    this.mpage = Math.max(0, v);
    this.selected = null;
    const arr = this.cards.slice(
      this.pageSize * this.page,
      this.pageSize * (this.page + 1)
    );
    for (let i = 0; i < arr.length; i++) {
      const element = arr[i];
      if (!element) {
        arr[i] = this.getNewCard();
      }
    }

    while (arr.length < this.pageSize) {
      arr.push(this.getNewCard());
    }
    this.current = arr;
  }

  get emptyPage() {
    for (const card of this.current) {
      if (card.cardType !== 3) return false;
    }
    return true;
  }
  isValid(card: Card) {
    if (card.cardType == 0) {
      if (!card.imagePath || !card.imagePath || !card.title) {
        return false;
      }
    }
    return true;
  }
  onRows() {
    this.page = 0;
  }
  onColumns() {
    this.page = 0;
  }

  mounted() {
    this.loadSet();
  }
  async loadSet() {
    this.filename = await storageService.copyToTemp(
      this.$route.params.path.toString()
    );

    const config = await storageService.getConfigFile(this.filename);
    if (config) {
      this.config = config;
      this.columns = config.columns;
      this.rows = config.rows;
      this.cards = config.cards;
      this.isWithoutSpace = config.withoutSpace;
      this.isDirectSet = !!config.directSet;
      this.page = 0;
    }
  }
  select(index: number) {
    let card = this.cards[this.pageSize * this.page + index];
    if (!card) {
      card = this.cards[this.pageSize * this.page + index] =
        this.current[index];
    }
    this.selected = card;
  }

  getNewCard(): NewCard {
    return {
      cardType: 3,
      id: uuid(),
    };
  }

  async selectImage() {
    if (!this.filename) return;
    const id = await storageService.selectImage(this.filename);

    if (this.selected && this.selected.cardType === 0)
      this.selected.imagePath = id;
  }

  playAudio() {
    if (this.filename && this.selected && this.selected.cardType == 0)
      TTS.instance.playCards(this.filename, [this.selected]);
  }
}
</script>

<style scoped>
.editor {
  display: grid;
  gap: 16px;
  grid-template-rows: 3fr 9fr;
  height: calc(100vh - 64px);
  padding: 10px;
}
.editor-body {
  display: grid;
  grid-template-columns: 8fr 4fr;
}
.cards {
  height: 80%;
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
  background: yellow;
}

.nonValid {
  border: 3px solid red;
}
</style>
