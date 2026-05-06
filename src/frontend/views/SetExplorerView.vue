<template>
  <v-layout
    v-if="filename && config"
    full-height
    class="root"
    :class="{
      root_hide: !showStandardOutput && !isQuiz && !isMatch && !isSettingsOpened,
      root_settings: isSettingsOpened
    }"
  >
    <layout-settings-panel />

    <output-line
      v-if="showStandardOutput"
      :cards="cards"
      :file="filename"
      :config="config"
      @value="(newCards: Card[]) => (cards = newCards)"
    />

    <quiz-output-line
      v-if="isQuiz && !isSettingsOpened"
      :config="config"
      :page="quizFinished ? totalPages : page"
      :errors="quizErrors"
      :waiting-for-next="waitingForNext"
      @restart="
        page = 0,
        quizErrors = 0,
        waitingForNext = false,
        quizFinished = false
      "
      @next="advanceQuiz"
    />

    <match-output-line
      v-if="isMatch && !isSettingsOpened"
      :errors="matchErrors"
      :message="matchMessage"
      :solved-pairs="solvedPairs"
      :total-pairs="totalPairs"
    />

    <set-grid
      :config="config"
      :file="filename"
      :page="page"
      :matched-card-ids="matchedCardIds"
      :selected-card-id="selectedCardId"
      @update:page="page = $event"
      @card="addCard"
    />
  </v-layout>
</template>

<script lang="ts" setup>
import type { Ref } from "vue";
import { computed, onMounted, ref, watch } from "vue";
import { useStore } from "vuex";
import { useRoute } from "vue-router";
import OutputLine from "@/frontend/components/OutputLine.vue";
import QuizOutputLine from "@/frontend/components/QuizOutputLine.vue";
import MatchOutputLine from "@/frontend/components/MatchOutputLine.vue";
import SetGrid from "@/frontend/components/SetGrid.vue";
import { CardType, normalizePage, type Card } from "@/common/interfaces/ConfigFile";
import { TTS } from "@/frontend/utils/TTS";
import { Metric } from "@/frontend/utils/Metric";
import LayoutSettingsPanel from "../components/LayoutSettingsPanel.vue";

const store = useStore();
const route = useRoute();

const filename: Ref<string | null> = ref(null);
const cards: Ref<Card[]> = ref([]);
const quizErrors = ref(0);
const waitingForNext = ref(false);
const quizFinished = ref(false);
const matchErrors = ref(0);
const matchMessage = ref("Соотнесите элементы из верхней и нижней строки");
const selectedCardId = ref<string | null>(null);
const matchedCardIds = ref<string[]>([]);

onMounted(async () => {
  filename.value = route.params.path.toString();
  await store.dispatch("open_file", filename.value);
  await store.dispatch("editor_current", filename.value);
  Metric.registerEvent(store.state.pcHash, "openSet", { filename: filename.value });
});

const config = computed(() => store.state.explorer.config);

const totalPages = computed(() => Math.max(1, config.value?.pages?.length ?? 0));

const page = computed({
  get (): number {
    return Math.max(0, Math.min(totalPages.value - 1, store.state.explorer.page ?? 0));
  },
  set (value: number) {
    const next = Math.max(0, Math.min(totalPages.value - 1, value));
    store.commit("explorer_page", next);
  }
});

const currentPage = computed(() => {
  return normalizePage(config.value?.pages?.[page.value] ?? {
    mode: "standard",
    columns: 3,
    rows: 3,
    cards: []
  });
});

const interfaceOutputLine = computed(() => store.state.ui.outputLine);
const isQuiz = computed(() => currentPage.value.mode === "quiz");
const isMatch = computed(() => currentPage.value.mode === "match");
const quizAutoNext = computed(() => config.value?.quizAutoNext);
const isSettingsOpened = computed(() => store.state.layoutSettings.isOpened);

const showStandardOutput = computed(() => {
  return interfaceOutputLine.value && !isQuiz.value && !isMatch.value && !isSettingsOpened.value;
});

const totalPairs = computed(() => {
  const ids = new Set(
    currentPage.value.cards
      .filter((card) => !!card.matchId)
      .map((card) => card.matchId)
  );
  return Math.max(1, ids.size);
});

const solvedPairs = computed(() => matchedCardIds.value.length / 2);

watch(page, resetPageState);
watch(currentPage, resetPageState);

function resetPageState () {
  cards.value = [];
  waitingForNext.value = false;
  quizFinished.value = false;
  selectedCardId.value = null;
  matchedCardIds.value = [];
  matchErrors.value = 0;
  matchMessage.value = "Соотнесите элементы из верхней и нижней строки";
}

function advancePage () {
  waitingForNext.value = false;
  if (page.value < totalPages.value - 1) {
    page.value++;
  } else {
    quizFinished.value = true;
  }
}

function advanceQuiz () {
  advancePage();
}

async function addCard (card: Card, index: number) {
  Metric.registerEvent(store.state.pcHash, "cardClick", { card });
  if (isQuiz.value) {
    await onQuizCard(card);
    return;
  }
  if (isMatch.value) {
    await onMatchCard(card, index);
    return;
  }
  if (showStandardOutput.value) {
    if (
      (config.value?.withoutSpace && [CardType.AudioCard, CardType.SpaceCard].includes(card.cardType)) ||
      (!config.value?.withoutSpace && card.cardType === CardType.AudioCard)
    ) {
      cards.value.push(card);
    }
  } else if (filename.value) {
    TTS.instance.playCards(filename.value, [card], true);
  }
}

async function onQuizCard (card: Card) {
  if (waitingForNext.value) return;
  if (card.answer) {
    await TTS.instance.forcePlayText("Правильный ответ");
    if (quizAutoNext.value) {
      advancePage();
    } else {
      waitingForNext.value = true;
    }
  } else {
    await TTS.instance.forcePlayText("Неправильный ответ");
    quizErrors.value++;
    if (quizAutoNext.value) {
      advancePage();
    }
  }
}

async function onMatchCard (card: Card, index: number) {
  if (!filename.value || card.cardType !== CardType.AudioCard || matchedCardIds.value.includes(card.id)) return;

  const row = index < currentPage.value.columns ? 0 : 1;
  const previous = currentPage.value.cards.find((item) => item.id === selectedCardId.value);

  await TTS.instance.playCards(filename.value, [card], true);

  if (!selectedCardId.value) {
    selectedCardId.value = card.id;
    matchMessage.value = "Выберите карточку из другой строки";
    return;
  }

  if (selectedCardId.value === card.id) {
    selectedCardId.value = null;
    matchMessage.value = "Соотнесите элементы из верхней и нижней строки";
    return;
  }

  const previousIndex = currentPage.value.cards.findIndex((item) => item.id === selectedCardId.value);
  const previousRow = previousIndex < currentPage.value.columns ? 0 : 1;
  if (!previous || previousRow === row) {
    selectedCardId.value = card.id;
    matchMessage.value = "Выберите карточку из другой строки";
    return;
  }

  if (previous.matchId && card.matchId && previous.matchId === card.matchId) {
    matchedCardIds.value = [...new Set([...matchedCardIds.value, previous.id, card.id])];
    selectedCardId.value = null;
    matchMessage.value = "Верно";
    await TTS.instance.forcePlayText("Правильно");

    if (solvedPairs.value >= totalPairs.value) {
      matchMessage.value = "Все пары найдены";
      setTimeout(() => {
        if (page.value < totalPages.value - 1) {
          page.value++;
        }
      }, 700);
    }
    return;
  }

  selectedCardId.value = null;
  matchErrors.value++;
  matchMessage.value = "Неверная пара";
  await TTS.instance.forcePlayText("Неправильно");
}
</script>
<style scoped>
.root {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}
.root_settings {
  grid-template-rows: auto minmax(0, 1fr);
}
.root_hide {
  grid-template-rows: minmax(0, 1fr);
}
.root > div {
  width: 100%;
}
</style>
