<template>
  <v-layout>
    <v-layout full-height class="output-line">
      <gaze-pause-button :disabled="startDialog || endDialog" />
      <eye-button
        aria-label="Послушать вопрос"
        :disabled="startDialog || endDialog"
        @click="sayQuestion"
      >
        <v-icon>mdi-account-voice</v-icon>
        <span class="button-label">Послушать</span>
      </eye-button>
      <div class="question-block">
        <h1>{{ question }}</h1>
        <p class="answer-feedback" role="status" aria-live="polite">{{ feedback }}</p>
        <div class="attempts" :aria-label="`Ошибок: ${errors}`">Ошибок: {{ errors }}</div>
      </div>
      <eye-button
        :color="waitingForNext ? 'primary' : 'accent'"
        :disabled="!waitingForNext || startDialog || endDialog"
        @click="emit('next')"
      >
        <span v-if="!waitingForNext" class="next-hint">Выберите ответ</span>
        <h1 v-else>
          <v-icon>mdi-arrow-right</v-icon>
          Далее
        </h1>
      </eye-button>
    </v-layout>
    <v-layout row justify-center style="position: absolute">
      <v-dialog v-model="endDialog">
        <v-card>
          <v-card-title>
            <span class="headline">Викторина завершена</span>
          </v-card-title>
          <v-card-text> Вы прошли все вопросы. Ошибок: {{ errors }} </v-card-text>
          <v-card-text> Хотите начать сначала? </v-card-text>
          <div class="quiz-actions">
            <eye-button color="primary" @click="(emit('restart'), (endDialog = false))">
              Начать сначала
            </eye-button>
            <eye-button color="accent" @click="finishQuiz"> К наборам </eye-button>
          </div>
        </v-card>
      </v-dialog>
      <v-dialog v-model="startDialog">
        <v-card>
          <v-card-title>
            <span class="headline">Викторина</span>
          </v-card-title>
          <v-card-text> Вам будут предложены вопросы, выбирайте ответы </v-card-text>
          <div class="quiz-actions">
            <eye-button color="primary" @click="startDialog = false"> Начать </eye-button>
          </div>
        </v-card>
      </v-dialog>
    </v-layout>
  </v-layout>
</template>

<script lang="ts" setup>
import { computed, nextTick, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { normalizePage, type ConfigFile } from "@/common/interfaces/ConfigFile";
import { TTS } from "@/frontend/utils/TTS";
import EyeButton from "@/frontend/components/EyeButton.vue";
import GazePauseButton from "./GazePauseButton.vue";

interface IQuizOutputLineProps {
  config: ConfigFile;
  page: number;
  errors: number;
  waitingForNext: boolean;
  feedback?: string;
}

const props = defineProps<IQuizOutputLineProps>();
const emit = defineEmits<{
  (e: "restart"): void;
  (e: "next"): void;
  (e: "dialog", open: boolean): void;
}>();
const router = useRouter();
const route = useRoute();

const startDialog = ref(true);
const endDialog = ref(false);

watch([startDialog, endDialog], ([start, end]) => emit("dialog", start || end), {
  immediate: true
});

const currentPage = computed(() => {
  return normalizePage(
    props.config.pages?.[Math.min(props.page, totalPages.value - 1)] ?? {
      mode: "quiz",
      columns: 3,
      rows: 3,
      cards: [],
      question: ""
    }
  );
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

async function sayQuestion() {
  const text = question.value;
  if (!text) return;
  await TTS.instance.forcePlayText(text);
}

async function finishQuiz() {
  endDialog.value = false;
  await nextTick();
  const file = String(route.params.path ?? "");
  await router.push(file.includes(":") ? "/" : "/" + file.split("§").slice(0, -1).join("§"));
}

watch(startDialog, async (v) => {
  if (v) {
    TTS.instance
      .forcePlayText("Этот набор викторина! Вам будут предложены вопросы, выбирайте ответы")
      .catch(console.error);
  } else {
    await TTS.instance.forcePlayText("Начинаем викторину").catch(console.error);
    if (props.config.quizReadQuestion) {
      await sayQuestion();
    }
  }
});

watch(
  () => props.page,
  async () => {
    if (startDialog.value) return;
    if (end.value) return;
    if (props.config.quizReadQuestion) {
      await sayQuestion();
    }
  }
);

watch(end, () => {
  endDialog.value = end.value;
  if (end.value) {
    TTS.instance
      .forcePlayText(`Викторина окончена. Количество ошибок: ${props.errors}`)
      .catch(console.error);
  }
});
</script>

<style scoped>
.output-line {
  height: 150px;
  display: grid;
  grid-template-columns: 1fr 1fr minmax(0, 6fr) 2fr;
  align-items: center;
  background: var(--linka-surface);
}
.button-label {
  display: block;
  margin-top: 8px;
  font-size: clamp(12px, 1.2vw, 18px);
}
.next-hint {
  font-size: clamp(16px, 1.6vw, 22px);
  color: var(--linka-muted);
}
.question-block {
  min-width: 0;
  max-height: 100%;
  overflow: auto;
  padding: 8px 20px;
}
.answer-feedback {
  min-height: 1.5em;
  font-size: clamp(16px, 1.6vw, 22px);
  font-weight: 600;
  color: rgb(var(--v-theme-primary));
}
h1 {
  width: 100%;
  font-size: clamp(18px, 2.4vw, 32px);
  overflow-wrap: anywhere;
  line-height: 1.2;
}
.attempts {
  color: var(--linka-muted);
  font-size: 14px;
}
.quiz-actions {
  display: flex;
  gap: 16px;
  padding: 16px;
}
.quiz-actions > .eyebtn {
  min-height: 96px;
  font-size: 20px;
  padding: 12px;
}
</style>
