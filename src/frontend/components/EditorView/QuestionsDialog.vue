<template>
  <v-dialog v-model="dialog" width="auto">
    <template #activator="{ props }">
      <v-btn flat v-bind="props">Редактировать вопросы</v-btn>
    </template>
    <v-card>
      <v-card-title primary-title>Вопросы викторины</v-card-title>
      <v-card-text>
        <div v-for="(question, index) in questions" :key="index" class="mb-2">
          <v-text-field
            v-model="questions[index]"
            :label="`Вопрос ${index + 1}`"
            clearable
          />
        </div>
        <v-btn block color="primary" class="mt-2" @click="addQuestion">
          Добавить вопрос
        </v-btn>
        <v-btn
          v-if="questions.length"
          block
          color="error"
          class="mt-2"
          @click="removeQuestion"
        >
          Удалить последний
        </v-btn>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { ref, computed } from "vue";
import { useStore } from "vuex";

const store = useStore();
const dialog = ref(false);

const questions = computed<string[]>({
  get () {
    return store.state.editor.questions;
  },
  set (v: string[]) {
    store.commit("editor_questions", v);
  }
});

function addQuestion () {
  questions.value = [...questions.value, ""];
}

function removeQuestion () {
  questions.value = questions.value.slice(0, -1);
}
</script>

<style scoped>
.mb-2 {
  margin-bottom: 8px;
}
</style>
