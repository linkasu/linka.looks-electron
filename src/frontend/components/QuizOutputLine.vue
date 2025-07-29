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
      <h1 v-if="config.questions && page != undefined && !end">
        {{ question }}
      </h1>
      <h1>
        <v-icon
          color="green"
          :icon="`mdi-numeric-${page + 1}-box`"
        />/<v-icon
          color="primary"
          :icon="`mdi-numeric-${config.questions?.length}-box`"
        />
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
            <eye-button class="gaze-btn" color="green" @click="emit('restart'); endDialog = false">
              Да
            </eye-button>
            <eye-button class="gaze-btn" color="green" @click="endDialog = false">
              Нет
            </eye-button>
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
            <eye-button class="gaze-btn" color="green" @click="startDialog = false">
              Начать
            </eye-button>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-layout>
  </v-layout>
</template>

<script lang="ts" setup>
import { defineProps, defineEmits, computed, ref, watch } from "vue";
import { useStore } from "vuex";
import type { ConfigFile } from "@/common/interfaces/ConfigFile";
import { TTS } from "@/frontend/utils/TTS";
import EyeButton from "@/frontend/components/EyeButton.vue";

interface IQuizOutputLineProps {
  config: ConfigFile
  page: number
  errors: number
}

const props = defineProps<IQuizOutputLineProps>();
const emit = defineEmits<{(e: "restart"): void }>();

const store = useStore();

const startDialog = ref(true);
const endDialog = ref(false);

const voice = computed(() => store.state.voice);

watch(startDialog, (v) => {
  const text = v
    ? "Этот набор викторина! Вам будут предложены вопросы, выбирайте ответы"
    : "Начинаем викторину";
  TTS.instance.playText(text, voice.value).catch(console.error);
});

const question = computed(() => {
  const text = readQuestion();
  return text;
});

const end = computed(() => {
  if (!props.config.questions) return false;
  const isEnd = props.page >= props.config.questions.length;
  return isEnd;
});

watch(
  end,
  () => {
    endDialog.value = end.value;
    if (end.value) {
      TTS.instance
        .playText(`Викторина окончена. Количество ошибок: ${props.errors}`, voice.value)
        .catch(console.error);
    }
  }
);

function readQuestion () {
  if (!props.config.questions) return "";
  const text = props.config.questions[props.page];

  if (props.config.quizReadQuestion && !startDialog.value) {
    TTS.instance.playText(text, voice.value).catch(console.error);
  }
  return text;
}
</script>

<style scope>
.output-line {
  height: 150px;
  display: grid;
  grid-template-columns: 1fr 1fr 6fr 2fr;
}
h1 {
  height: 90%;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.gaze-btn {
  width: 200px;
  height: 100px;
  font-size: 1.2em;
  margin: 0.5em;
}
</style>
