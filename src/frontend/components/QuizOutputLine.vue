<template>
  <v-layout>
    <v-layout
      v-if="!end"
      full-height
      class="output-line"
    >
      <h1>
        <v-icon>mdi-head-question</v-icon>
      </h1>

      <h1>
        <v-icon
          color="error"
          :icon="`mdi-numeric-${errors}-box`"
        />
      </h1>
      <eye-button @click="sayQuestion">
        <v-icon class="speaker-icon">mdi-account-voice</v-icon>
      </eye-button>
      <h1 v-if="page != undefined && !end && !waitingForNext">
        {{ question }}
      </h1>
      <eye-button
        v-if="waitingForNext"
        color="primary"
        @click="emit('next')"
      >
        <h1>
          <v-icon>mdi-arrow-right</v-icon>
          Далее
        </h1>
      </eye-button>
      <h1>
        {{ page + 1 }} из {{ totalPages }}
      </h1>
    </v-layout>
    <v-layout
      row
      justify-center
      style="position: absolute"
    >
      <v-dialog v-model="endDialog">
        <v-card>
          <v-card-title>
            <span class="headline">Опрос окончен</span>
          </v-card-title>
          <v-card-text> Количество ошибок: {{ errors }} </v-card-text>
          <v-card-text> Хотите начать сначала? </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn
              color="green darken-1"
              @click="
                emit('restart'),
                endDialog = false
              "
            >
              Да
            </v-btn>
            <v-btn
              color="green darken-1"
              @click="endDialog = false"
            >
              Нет
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
      <v-dialog v-model="startDialog">
        <v-card>
          <v-card-title>
            <span class="headline">Этот набор викторина!</span>
          </v-card-title>
          <v-card-text> Вам будут предложены вопросы, выбирайте ответы </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn
              color="green darken-1"
              @click="startDialog = false"
            >
              Начать
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-layout>
  </v-layout>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from "vue";
import { normalizePage, type ConfigFile } from "@/common/interfaces/ConfigFile";
import { TTS } from "@/frontend/utils/TTS";
import EyeButton from "@/frontend/components/EyeButton.vue";

interface IQuizOutputLineProps {
  config: ConfigFile
  page: number
  errors: number
  waitingForNext: boolean
}

const props = defineProps<IQuizOutputLineProps>();
const emit = defineEmits<{
  (e: "restart"): void
  (e: "next"): void
}>();

const startDialog = ref(true);
const endDialog = ref(false);

const currentPage = computed(() => {
  return normalizePage(props.config.pages?.[props.page] ?? {
    mode: "quiz",
    columns: 3,
    rows: 3,
    cards: [],
    question: ""
  });
});

const question = computed(() => {
  return currentPage.value.question ?? "";
});

const totalPages = computed(() => {
  return Math.max(1, props.config.pages?.length ?? 0);
});

const end = computed(() => {
  return props.page >= (props.config.pages?.length ?? 0);
});

async function sayQuestion () {
  const text = question.value;
  if (!text) return;
  await TTS.instance.forcePlayText(text);
}

watch(startDialog, async (v) => {
  if (v) {
    TTS.instance.forcePlayText(
      "Этот набор викторина! Вам будут предложены вопросы, выбирайте ответы"
    ).catch(console.error);
  } else {
    await TTS.instance.forcePlayText("Начинаем викторину").catch(console.error);
    if (props.config.quizReadQuestion) {
      await sayQuestion();
    }
  }
});

watch(() => props.page, async () => {
  if (startDialog.value) return;
  if (end.value) return;
  if (props.config.quizReadQuestion) {
    await sayQuestion();
  }
});

watch(
  end,
  () => {
    endDialog.value = end.value;
    if (end.value) {
      TTS.instance
        .forcePlayText(`Викторина окончена. Количество ошибок: ${props.errors}`)
        .catch(console.error);
    }
  }
);
</script>

<style scope>
.output-line {
  height: 150px;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 5fr 2fr;
}
.speaker-icon {
  width: 100%;
  height: 100%;
}
h1 {
  height: 90%;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
