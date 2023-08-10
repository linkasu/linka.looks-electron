<template>
  <div fluid class="editor">
    <new-file-dialog ref="newFile" @text="newFileName" />
    <div class="editor-body">
      <v-card xs8 fill-height fluid v-if="filename">
        <v-card-title> Карточки </v-card-title>
        <v-card-text>
          <v-text-field v-if="isQuiz" label="Введите вопрос для этой страницы" v-model="questions[page]"></v-text-field>
        </v-card-text>
        <v-card-text class="cards-wrapper">
          <draggable v-model="current" item-key="id" class="cards" :style="{ '--rows': rows, '--columns': columns }">
            <template #item="{ element, index }">

              <set-grid-button :key="element.id" :file="filename" :card="element" :enabled="false" :class="{
                selected: selected?.id === element?.id,
                nonValid: !isValid(element),
              }" :dot="!!element.answer" @click="select(index)" />
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
                <v-btn block color="orange" @click="page++" :disabled="emptyPage">
                  <v-icon>mdi-arrow-right</v-icon>
                </v-btn>
              </v-col>
            </v-row>
          </v-layout>
        </v-card-text>
      </v-card>
      <v-card v-if="selected">
        <v-btn v-if="selected.cardType != 3" title="Сбросить карточку" icon absolute color="error" class="delete"
          @click="selected.cardType = 3"><v-icon>mdi-delete</v-icon></v-btn>
        <v-card-title primary-title> Редактировать карточку </v-card-title>
        <v-card-text>
          <v-form>
            <v-row>
              <v-select :items="cardTypes" v-model="selected.cardType" label="Тип карточки" item-title="text"
                item-value="value"></v-select>
            </v-row>
            <section v-if="selected.cardType == 0">
              <v-row>
                <v-text-field outline label="Название карточки" v-model="selected.title"></v-text-field>
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
                        <create-from-text-dialog block :file="filename"
                          @image="(path: string) => (selected.imagePath = path)" />
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
                        <tts-dialog :file="filename" @audio="(src) => (selected.audioPath = src)" />
                      </v-row>
                      <v-row>
                        <v-btn block @click="selectAudio">
                          Выбрать звук из файла
                        </v-btn>
                      </v-row>
                      <v-row v-if="selected.audioPath">
                        <v-btn block @click="playAudio">Послушать озвучку</v-btn>
                      </v-row>
                    </v-container>
                  </v-card-text>
                </v-card>
              </v-row>
              <v-row>

                <v-card width="100%" v-if="isQuiz">
                  <v-card-title primary-title> Работа с викториной </v-card-title>
                  <v-card-text>
                    <v-container>
                      <v-checkbox label="Отметить как правильный ответ" v-model="selected.answer" />
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
import { Metric } from "@/utils/Metric";
class Props { }

@Options({
  components: {
    SetGridButton,
    draggable,
    CreateFromTextDialog,
    NewFileDialog,
    "tts-dialog": TTSDialog
  },
  watch: {
    columns: "onColumns",
    rows: "onRows"
  }
})
export default class EditorView extends Vue.with(Props) {
  mcurrent: (Card | NewCard)[] = [];
  get columns (): number {
    return this.$store.state.editor.columns;
  }

  public set columns (v: number) {
    this.$store.commit("editor_columns", v);
  }

  get rows (): number {
    return this.$store.state.editor.rows;
  }

  public set rows (v: number) {
    this.$store.commit("editor_rows", v);
  }

  mpage = 0;

  get cards (): (Card | NewCard)[] {
    return this.$store.state.editor.cards;
  }

  public set cards (v: (Card | NewCard)[]) {
    this.$store.commit("editor_cards", v);
  }

  get filename (): string | null {
    return this.$store.state.editor.temp;
  }

  selected: Card | NewCard | null = null;

  cardTypes = [
    { text: "Обычная", value: 0 },
    { text: "Пустая ", value: 2 },
    { text: "Пробел", value: 1 },
    { text: "Новая карточка", value: 3 }
  ];

  get current (): (Card | NewCard)[] {
    return this.mcurrent;
  }

  set current (v: (Card | NewCard)[]) {
    if (v.length == this.mcurrent.length) {
      const cids = this.mcurrent
        .map(({ id }) => id.toString())
        .reduce((a, b) => a + b);
      const nids = v.map(({ id }) => id.toString()).reduce((a, b) => a + b);
      this.mcurrent = v;

      if (cids != nids) {
        for (let index = 0; index < v.length; index++) {
          const element = v[index];
          this.cards[this.pageSize * this.page + index] = element;
        }
      }
    } else {
      this.mcurrent = v;
    }
  }

  get isWithoutSpace (): boolean {
    return this.$store.state.editor.isWithoutSpace;
  }

  set isWithoutSpace (v: boolean) {
    this.$store.commit("editor_isWithoutSpace", v);
  }

  get isDirectSet (): boolean {
    return this.$store.state.editor.isDirectSet;
  }

  set isDirectSet (v: boolean) {
    this.$store.commit("editor_isDirectSet", v);
  }

  get isQuiz (): boolean {
    return this.$store.state.editor.quiz;
  }

  set isQuiz (v: boolean) {
    this.$store.commit("editor_isQuiz", v);
  }

  get pageSize (): number {
    return this.columns * this.rows;
  }

  public get page (): number {
    return this.mpage;
  }

  public set page (v: number) {
    this.mpage = Math.max(0, v);
    this.selected = null;
    if (!this.cards) return;
    const arr = this.cards?.slice(
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

  get emptyPage () {
    for (const card of this.current) {
      if (card.cardType !== 3) return false;
    }
    return true;
  }

  get questions (): string[] {
    return this.$store.state.editor.questions;
  }

  isValid (card: Card) {
    if (card.cardType == 0) {
      if (!card.imagePath || !card.imagePath || !card.title) {
        return false;
      }
    }
    return true;
  }

  onRows () {
    this.page = 0;
  }

  onColumns () {
    this.page = 0;
  }

  mounted () {
    if (this.path.endsWith("new")) {
      (this.$refs.newFile as NewFileDialog).show();
    } else this.loadSet();
    Metric.registerEvent("openEditor");
  }

  async newFileName (text: string) {
    await this.$store.dispatch(
      "editor_new_file",
      this.path.slice(0, -3) + text
    );
    this.page = 0;
  }

  async loadSet () {
    await this.$store.dispatch("editor_current", this.path);
    this.page = 0;
  }

  private get path (): string {
    return this.$route.params.path.toString();
  }

  select (index: number) {
    console.log(index);

    let card = this.cards[this.pageSize * this.page + index];
    if (!card) {
      card = this.cards[this.pageSize * this.page + index] =
        this.current[index];
    }
    this.selected = card;
  }

  getNewCard (): NewCard {
    return {
      cardType: 3,
      id: uuid()
    };
  }

  async selectImage () {
    if (!this.filename) return;
    const id = await storageService.selectImage(this.filename);
    console.log(id);

    if (this.selected && this.selected.cardType === 0) { this.selected.imagePath = id; }
  }

  async selectAudio () {
    if (!this.filename) return;
    const id = await storageService.selectAudio(this.filename);

    if (this.selected && this.selected.cardType === 0 && id) { this.selected.audioPath = id; }
  }

  playAudio () {
    if (this.filename && this.selected && this.selected.cardType == 0) { TTS.instance.playCards(this.filename, [this.selected]); }
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
