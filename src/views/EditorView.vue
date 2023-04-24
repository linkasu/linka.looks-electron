<template>
  <div fluid class="editor">
    <new-file-dialog ref="newFile" @text="newFileName" />
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
                    v-model="rows"
                  ></v-text-field>
                </v-col>
                <v-col xs12 md6>
                  <v-text-field
                    label="Количество колонок"
                    small
                    :min="1"
                    type="number"
                    v-model="columns"
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
      <v-card xs8 fill-height fluid v-if="filename">
        <v-card-title> Карточки </v-card-title>
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
                  nonValid: !isValid(element),
                }"
                @click="select(index)"
              />
            </template>
          </draggable>
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
                          @image="(path:string) => (selected.imagePath = path)"
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
                      <v-row>
                        <v-btn block @click="selectAudio">
                          Выбрать звук из файла
                        </v-btn>
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
      <v-card v-else>
        <v-card-title primary-title>
          Выберете картинку для начала работы
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

<script lang="ts">
import { Vue, prop, Options } from "vue-class-component";
import SetGridButton from "@/components/SetGridButton.vue";
import CreateFromTextDialog from "@/components/EditorView/CreateFromTextDialog.vue";
import NewFileDialog from "@/components/EditorView/NewFileDialog.vue";
import TTSDialog from "@/components/EditorView/TTSDialog.vue";
import { Card, ConfigFile, NewCard } from "@/interfaces/ConfigFile";
import { storageService } from "@/CardsStorage/frontend";
import { uuid } from "uuidv4";
import { TTS } from "@/utils/TTS";
import draggable from "vuedraggable";
class Props {}

@Options({
  components: {
    SetGridButton,
    draggable,
    CreateFromTextDialog,
    NewFileDialog,
    "tts-dialog": TTSDialog,
  },
  watch: {
    columns: "onColumns",
    rows: "onRows",
  },
})
export default class EditorView extends Vue.with(Props) {
  mcurrent: (Card | NewCard)[] = [];
  get columns(): number {
    return this.$store.getters.editor_columns;
  }

  public set columns(v: number) {
    this.$store.commit("editor_columns", v);
  }
  get rows(): number {
    return this.$store.getters.editor_rows;
  }

  public set rows(v: number) {
    this.$store.commit("editor_rows", v);
  }

  mpage = 0;

  get cards(): (Card | NewCard)[] {
    return this.$store.getters.editor_cards;
  }

  public set cards(v: (Card | NewCard)[]) {
    this.$store.commit("editor_cards", v);
  }

  get filename(): string | null {
    return this.$store.getters.editor_temp;
  }
  selected: Card | NewCard | null = null;

  cardTypes = [
    { text: "Обычная", value: 0 },
    { text: "Пустая ", value: 2 },
    { text: "Пробел", value: 1 },
    { text: "Новая карточка", value: 3 },
  ];

  get current(): (Card | NewCard)[] {
    return this.mcurrent;
  }
  set current(v: (Card | NewCard)[]) {
    if (v.length == this.mcurrent.length) {
      const cids = this.mcurrent
        .map(({ id }) => id.toString())
        .reduce((a, b) => a + b);
      const nids = v.map(({ id }) => id.toString()).reduce((a, b) => a + b);
      this.mcurrent = v;

      if (cids != nids) {
        for (let index = 0; index < v.length; index++) {
          const element = v[index];
          this.cards[this.pageSize * this.page+index] = element
        }
      }
    } else{
      this.mcurrent = v;
    }
  }
  get isWithoutSpace(): boolean {
    return this.$store.getters.editor_isWithoutSpace;
  }
  set isWithoutSpace(v: boolean) {
    this.$store.commit("editor_isWithoutSpace", v);
  }
  get isDirectSet(): boolean {
    return this.$store.getters.editor_isDirectSet;
  }
  set isDirectSet(v: boolean) {
    this.$store.commit("editor_isDirectSet", v);
  }

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
    if (this.path.endsWith("new")) {
      (this.$refs.newFile as NewFileDialog).show();
    } else this.loadSet();
  }
  async newFileName(text: string) {
    await this.$store.dispatch(
      "editor_new_file",
      this.path.slice(0, -3) + text
    );
    this.page = 0;
  }
  async loadSet() {
    await this.$store.dispatch("editor_current", this.path);
    this.page = 0;
  }
  private get path(): string {
    return this.$route.params.path.toString();
  }

  select(index: number) {
    console.log(index);

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
    console.log(id);

    if (this.selected && this.selected.cardType === 0)
      this.selected.imagePath = id;
  }

  async selectAudio() {
    if (!this.filename) return;
    const id = await storageService.selectAudio(this.filename);

    if (this.selected && this.selected.cardType === 0 && id)
      this.selected.audioPath = id;
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
  background: yellow !important;
  border: 1px solid yellow;
}

.nonValid {
  border: 3px solid red;
}
</style>
