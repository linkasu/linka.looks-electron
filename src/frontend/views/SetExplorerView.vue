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
      :show-exit-button="showGridExitButton"
      :matched-card-ids="matchedCardIds"
      :selected-card-id="selectedCardId"
      @update:page="page = $event"
      @card="addCard"
    />
  </v-layout>
</template>

<script lang="ts" setup>
import type { Ref } from "vue";
import { computed, ref, watch } from "vue";
import { useStore } from "vuex";
import { useRoute } from "vue-router";
import OutputLine from "@/frontend/components/OutputLine.vue";
import QuizOutputLine from "@/frontend/components/QuizOutputLine.vue";
import MatchOutputLine from "@/frontend/components/MatchOutputLine.vue";
import SetGrid from "@/frontend/components/SetGrid.vue";
import { normalizePage, type Card } from "@/common/interfaces/ConfigFile";
import { TTS } from "@/frontend/utils/TTS";
import { Telemetry } from "@/frontend/utils/Telemetry";
import LayoutSettingsPanel from "../components/LayoutSettingsPanel.vue";
import {
  advanceQuizPage,
  getSolvedMatchPairs,
  getTotalMatchPairs,
  handleMatchCard,
  handleQuizCard,
  shouldAddCardToStandardOutput
} from "@/frontend/utils/setGameLogic";

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

const isSettingsOpened = computed(() => store.state.layoutSettings.isOpened);

const config = computed(() => {
  if (isSettingsOpened.value && store.state.explorer.config) {
    return {
      ...store.state.explorer.config,
      pages: store.state.editor.pages
    };
  }
  return store.state.explorer.config;
});

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

const showStandardOutput = computed(() => {
  return interfaceOutputLine.value && !isQuiz.value && !isMatch.value && !isSettingsOpened.value;
});

const showGridExitButton = computed(() => {
  return store.state.ui.exitButton && !showStandardOutput.value;
});

const totalPairs = computed(() => {
  return getTotalMatchPairs(currentPage.value.cards, currentPage.value.columns);
});

const solvedPairs = computed(() => getSolvedMatchPairs(matchedCardIds.value));

watch(page, resetInteractivePageState);
watch(currentPage, resetInteractivePageState);
watch(
  () => route.params.path,
  async (value) => {
    if (!value) return;
    await loadSet(value.toString());
  },
  { immediate: true }
);

function resetInteractivePageState () {
  waitingForNext.value = false;
  quizFinished.value = false;
  selectedCardId.value = null;
  matchedCardIds.value = [];
  matchErrors.value = 0;
  matchMessage.value = "Соотнесите элементы из верхней и нижней строки";
}

async function loadSet (nextFilename: string) {
  store.commit("explorer_config", undefined);
  cards.value = [];
  quizErrors.value = 0;
  resetInteractivePageState();
  await store.dispatch("open_file", nextFilename);
  await store.dispatch("editor_current", nextFilename);
  filename.value = nextFilename;
  Telemetry.product("openSet");
}

function advancePage () {
  const result = advanceQuizPage({
    errors: quizErrors.value,
    page: page.value,
    quizFinished: quizFinished.value,
    totalPages: totalPages.value,
    waitingForNext: waitingForNext.value
  });
  page.value = result.page;
  waitingForNext.value = result.waitingForNext;
  quizFinished.value = result.quizFinished;
}

function advanceQuiz () {
  advancePage();
}

async function addCard (card: Card, index: number) {
  Telemetry.product("cardClick");
  if (isQuiz.value) {
    await onQuizCard(card);
    return;
  }
  if (isMatch.value) {
    await onMatchCard(card, index);
    return;
  }
  if (showStandardOutput.value) {
    if (shouldAddCardToStandardOutput(card, config.value?.withoutSpace)) {
      cards.value.push(card);
    }
  } else if (filename.value) {
    TTS.instance.playCards(filename.value, [card], true);
  }
}

async function onQuizCard (card: Card) {
  const result = handleQuizCard(card, {
    errors: quizErrors.value,
    page: page.value,
    quizFinished: quizFinished.value,
    totalPages: totalPages.value,
    waitingForNext: waitingForNext.value
  }, quizAutoNext.value);
  if (result.ignored) return;

  if (result.feedbackText) {
    await TTS.instance.forcePlayText(result.feedbackText);
  }
  page.value = result.page;
  quizErrors.value = result.errors;
  waitingForNext.value = result.waitingForNext;
  quizFinished.value = result.quizFinished;
}

async function onMatchCard (card: Card, index: number) {
  if (!filename.value) return;
  const result = handleMatchCard(card, index, {
    cards: currentPage.value.cards,
    columns: currentPage.value.columns,
    matchErrors: matchErrors.value,
    matchedCardIds: matchedCardIds.value,
    page: page.value,
    selectedCardId: selectedCardId.value,
    totalPages: totalPages.value
  });
  if (result.ignored) return;

  if (result.shouldPlayCard) {
    await TTS.instance.playCards(filename.value, [card], true);
  }
  selectedCardId.value = result.selectedCardId;
  matchedCardIds.value = result.matchedCardIds;
  matchErrors.value = result.matchErrors;
  matchMessage.value = result.matchMessage;

  if (result.feedbackText) {
    await TTS.instance.forcePlayText(result.feedbackText);
  }

  if (result.advancePageAfterSolved) {
    setTimeout(() => {
      page.value++;
    }, 700);
  }
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
