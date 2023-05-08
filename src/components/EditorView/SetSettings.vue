<template>
  <v-dialog
    fullscreen
    v-model="dialog"
    width="50%"
    class="set-settings"
    right="50%"
  >
    <template v-slot:activator="{ props }">
      <v-btn flat i v-bind="props"> Открыть настройки набора </v-btn>
    </template>
    <v-card>
      <v-toolbar>
        <v-toolbar-title>Настройки набора </v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn @click="dialog = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-toolbar>
      <v-card-text>
        <v-form @submit.prevent="">
          <v-subheader>Настройки размера сетки</v-subheader>
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
                type="number"
              />
            </v-col>
          </v-layout>
          <v-subheader> Настройки взаимодействия </v-subheader>
          <v-checkbox
            label="Набор для печати текста (если создаете клавиатуру)"
            v-model="isWithoutSpace"
            v-if="!isQuiz"
          ></v-checkbox>
          <v-checkbox
            label="Скрыть строку вывода при работе с набором"
            v-model="isDirectSet"
            v-if="!isQuiz"
          ></v-checkbox>
          <v-checkbox
            label="Набор для викторины"
            v-if="!isDirectSet"
            v-model="isQuiz"
          ></v-checkbox>
          <section v-if="isQuiz">
            <v-subheader> Настройки викторины </v-subheader>
            <v-checkbox
              label="Переключать на следующий вопрос при любом ответе"
              v-model="editor_quizAutoNext"
            ></v-checkbox>
            <v-checkbox
              label="Зачитывать вопрос"
              v-model="editor_quizReadQuestion"
            ></v-checkbox>
          </section>
        </v-form>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
import { Vue, prop, Options } from "vue-class-component";

class Props {
  defaultOpen = prop({
    default: false,
  });
}

@Options({})
export default class SetSettings extends Vue.with(Props) {
  dialog = this.defaultOpen;

  get columns(): number {
    return this.$store.state.editor.columns;
  }

  public set columns(v: number) {
    this.$store.commit("editor_columns", v);
  }
  get rows(): number {
    return this.$store.state.editor.rows;
  }

  public set rows(v: number) {
    this.$store.commit("editor_rows", v);
  }
  get isWithoutSpace(): boolean {
    return this.$store.state.editor.isWithoutSpace;
  }
  set isWithoutSpace(v: boolean) {
    this.$store.commit("editor_isWithoutSpace", v);
  }
  get isDirectSet(): boolean {
    return this.$store.state.editor.isDirectSet;
  }
  set isDirectSet(v: boolean) {
    this.$store.commit("editor_isDirectSet", v);
  }

  get isQuiz(): boolean {
    return this.$store.state.editor.quiz;
  }
  set isQuiz(v: boolean) {
    this.$store.commit("editor_isQuiz", v);
  }
  get editor_quizReadQuestion(): boolean {
    return this.$store.state.editor.quizReadQuestion;
  }
  set editor_quizReadQuestion(v: boolean) {
    this.$store.commit("editor_quizReadQuestion", v);
  }
  get editor_quizAutoNext(): boolean {
    return this.$store.state.editor.quizAutoNext;
  }
  set editor_quizAutoNext(v: boolean) {
    this.$store.commit("editor_quizAutoNext", v);
  }
}
</script>
<style>
.set-settings > .v-overlay__content {
  position: absolute;
  right: 0;
  margin-left: 50% !important;
}
</style>
