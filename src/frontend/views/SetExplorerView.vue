<template>
  <v-layout
    v-if="filename"
    full-height
    class="root"
    :class="{ root_hide: !interfaceOutputLine && !isQuiz }"
  >
    <output-line
      v-if="interfaceOutputLine && !isQuiz"
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

const store = useStore();
const route = useRoute();

const filename: Ref<string | null> = ref(null);
const cards: Ref<Card[]> = ref([]);
const quizPage = ref(0);
const errors = ref(0);

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

function addCard (card: Card) {
  Metric.registerEvent(store.state.pcHash, "cardClick", { card });
  if (isQuiz.value) {
    if (card.answer) {
      quizPage.value++;
    } else {
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
.root_hide {
  /* background-color: black; */
  grid-template-rows: 1fr;
}
.root > div {
  /* border: 1px solid black; */
  width: 100%;
}
</style>
