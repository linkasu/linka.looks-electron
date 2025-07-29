<template>
  <v-layout
    v-if="filename"
    full-height
    class="root"
    :class="{ root_hide: !interfaceOutputLine && !isQuiz && !isSettingsOpened, root_settings: isSettingsOpened}"
  >
    <div v-if="processing" class="answer-overlay" />
    <layout-settings-panel></layout-settings-panel>
    <output-line
      v-if="interfaceOutputLine && !isQuiz && !isSettingsOpened"
      :cards="cards"
      :file="filename"
      :config="config"
      @value="(new_cards: Card[]) => (cards = new_cards)"
    />
    <quiz-output-line
      v-if="isQuiz"
      :config="config"
      :page="quizPage"
      :errors="errors"
      @restart="
        quizPage = 0,
        errors = 0
      "
    />

    <set-grid
      v-if="config"
      :config="config"
      :file="filename"
      :quiz-page="quizPage"
      @card="addCard"
    />
  </v-layout>
</template>

<script lang="ts" setup>
import type { Ref } from "vue";
import { ref, computed, onMounted } from "vue";
import { useStore } from "vuex";
import { useRoute } from "vue-router";
import OutputLine from "@/frontend/components/OutputLine.vue";
import QuizOutputLine from "@/frontend/components/QuizOutputLine.vue";
import SetGrid from "@/frontend/components/SetGrid.vue";
import { CardType, type Card } from "@/common/interfaces/ConfigFile";
import { TTS } from "@/frontend/utils/TTS";
import { Metric } from "@/frontend/utils/Metric";
import { storageService } from "@/frontend/services/card-storage-service";
import LayoutSettingsPanel from "../components/LayoutSettingsPanel.vue";

const store = useStore();
const route = useRoute();

const filename: Ref<string | null> = ref(null);
const cards: Ref<Card[]> = ref([]);
const quizPage = ref(0);
const errors = ref(0);
const processing = ref(false);

onMounted(() => {
  filename.value = route.params.path.toString();
  store.dispatch("open_file", filename.value);
  Metric.registerEvent(store.state.pcHash, "openSet", { filename: filename });
});

const config = computed(() => {
  return store.state.explorer.config;
});

const interfaceOutputLine = computed(() => {
  return store.state.ui.outputLine;
});

const isQuiz = computed(() => {
  return config.value?.quiz;
});

const quizAutoNext = computed(() => {
  return config.value?.quizAutoNext;
});

const quizReadQuestion = computed(() => {
  return config.value?.quizReadQuestion;
});

const isSettingsOpened = computed(() => {
  return store.state.layoutSettings.isOpened;
});

function addCard (card: Card) {
  Metric.registerEvent(store.state.pcHash, "cardClick", { card });
  if (isQuiz.value) {
    const voice = store.state.voice;
    processing.value = true;
    store.commit("button_enabled", false);
    setTimeout(() => {
      processing.value = false;
      store.commit("button_enabled", true);
    }, 1500);
    if (Math.random() < 0.5 && card.title && filename.value) {
      storageService.createAudioFromText(filename.value, card.title, voice).catch(console.error);
      TTS.instance.playText(card.title, voice).catch(console.error);
    }
    if (card.answer) {
      TTS.instance.playText("Правильный ответ", voice).catch(console.error);
      quizPage.value++;
    } else {
      TTS.instance.playText("Неправильный ответ", voice).catch(console.error);
      errors.value++;
      if (quizAutoNext.value) {
        quizPage.value++;
      }
    }
    return;
  }
  if (interfaceOutputLine.value) {
    if (
      (config.value?.withoutSpace && [CardType.AudioCard, CardType.SpaceCard].includes(card.cardType)) ||
      (!config.value?.withoutSpace && card.cardType === CardType.AudioCard)
    ) {
      cards.value.push(card);
    }
  } else {
    if (filename.value) TTS.instance.playCards(filename.value, [card], true);
  }
}
</script>
<style scoped>
.root {
  display: grid;
  grid-template-rows: auto 8fr;
}
.root_settings {
  grid-template-rows: auto 1fr;
}
.root_hide {
  /* background-color: black; */
  grid-template-rows: 1fr;
}
.root > div {
  /* border: 1px solid black; */
  width: 100%;
}
.answer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
}
</style>
