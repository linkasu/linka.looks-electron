<template>
  <v-dialog
    v-model="dialog"
    fullscreen
    width="50%"
    class="set-settings"
    right="50%"
  >
    <template #activator="{ props }">
      <v-btn
        flat
        i
        v-bind="props"
      >
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
          <v-subheader>Настройки размера сетки</v-subheader>
          <v-layout
            row
            wrap
          >
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
            v-if="!isQuiz"
            v-model="isWithoutSpace"
            label="Набор для печати текста (если создаете клавиатуру)"
          />
          <v-checkbox
            v-if="!isQuiz"
            v-model="isDirectSet"
            label="Скрыть строку вывода и озвучивать карточку сразу при нажатии на нее"
          />
          <!-- <v-checkbox
            label="Набор для викторины"
            v-if="!isDirectSet"
            v-model="isQuiz"
          ></v-checkbox> -->
          <section v-if="isQuiz">
            <v-subheader> Настройки викторины </v-subheader>
            <v-checkbox
              v-model="editor_quizAutoNext"
              label="Переключать на следующий вопрос при любом ответе"
            />
            <v-checkbox
              v-model="editor_quizReadQuestion"
              label="Зачитывать вопрос"
            />
          </section>
        </v-form>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { defineProps, withDefaults, ref, computed } from 'vue'
import { useStore } from 'vuex'

const store = useStore()

const props = withDefaults(defineProps<{ defaultOpen: boolean }>(), { defaultOpen: false })

const dialog = ref(props.defaultOpen)

const columns = computed({
  get() {
    return store.state.editor.columns
  },
  set(v: number) {
    store.commit('editor_columns', v)
  }
})

const rows = computed({
  get(): number {
    return store.state.editor.rows
  },
  set(v: number) {
    store.commit('editor_rows', v)
  }
})

const isWithoutSpace = computed({
  get(): boolean {
    return store.state.editor.isWithoutSpace
  },
  set(v: boolean) {
    store.commit('editor_isWithoutSpace', v)
  }
})

const isDirectSet = computed({
  get(): boolean {
    return store.state.editor.isDirectSet
  },
  set(v: boolean) {
    store.commit('editor_isDirectSet', v)
  }
})

const isQuiz = computed({
  get(): boolean {
    return store.state.editor.quiz
  },
  set(v: boolean) {
    store.commit('editor_isQuiz', v)
  }
})

const editor_quizReadQuestion = computed({
  get(): boolean {
    return store.state.editor.quizReadQuestion
  },
  set(v: boolean) {
    store.commit('editor_quizReadQuestion', v)
  }
})

const editor_quizAutoNext = computed({
  get(): boolean {
    return store.state.editor.quizAutoNext
  },
  set(v: boolean) {
    store.commit('editor_quizAutoNext', v)
  }
})
</script>

<style>
.set-settings > .v-overlay__content {
  position: absolute;
  right: 0;
  margin-left: 50% !important;
}
</style>
