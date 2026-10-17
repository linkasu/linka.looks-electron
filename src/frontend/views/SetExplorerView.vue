<template>
  <v-layout
    v-if="filename && config"
    full-height
    class="root"
    :class="{
      root_settings: isSettingsOpened
    }"
  >
    <layout-settings-panel />
    <div
      v-if="!showStandardOutput && !isQuiz && !isMatch && !isSettingsOpened"
      class="compact-controls"
    >
      <gaze-pause-button />
      <span>Выберите карточку, чтобы произнести</span>
    </div>

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
      :feedback="quizFeedback"
      @restart="restartQuiz"
      @next="advanceQuiz"
      @dialog="quizDialogOpen = $event"
    />

    <match-output-line
      v-if="isMatch && isValidMatch && !isSettingsOpened"
      :errors="matchErrors"
      :message="matchMessage"
      :solved-pairs="solvedPairs"
      :total-pairs="totalPairs"
    />

    <set-grid
      v-if="!isMatch || isValidMatch"
      :config="config"
      :file="filename"
      :page="page"
      :show-exit-button="showGridExitButton"
      :matched-card-ids="matchedCardIds"
      :selected-card-id="selectedCardId"
      :interaction-blocked="
        interactionBusy || (isQuiz && (quizDialogOpen || waitingForNext || quizFinished))
      "
      :answer-card-id="answerCardId"
      :answer-correct="answerCorrect"
      @update:page="page = $event"
      @card="addCard"
    />
    <div v-else class="set-state" role="alert">
      <v-icon size="48" color="warning">mdi-link-off</v-icon>
      <h2>В этом задании пока нет доступных пар</h2>
      <p>Помощник может проверить связи между карточками в редакторе.</p>
      <eye-button color="accent" class="state-action" @click="$router.back()">
        К наборам
      </eye-button>
    </div>
  </v-layout>
  <div v-else class="set-state" :role="loadError ? 'alert' : 'status'">
    <template v-if="loadError">
      <v-icon size="48" color="warning">mdi-file-alert-outline</v-icon>
      <h2>Не удалось открыть набор</h2>
      <p>Проверьте, доступен ли файл, и попробуйте снова.</p>
      <eye-button
        color="accent"
        class="state-action"
        @click="loadSet(route.params.path.toString())"
      >
        Попробовать снова
      </eye-button>
    </template>
    <template v-else>
      <v-progress-circular indeterminate color="primary" aria-label="Загрузка набора" />
      <p>Открываем набор…</p>
    </template>
  </div>
</template>

<script lang="ts" setup>
import type { Ref } from "vue";
import { computed, ref, watch, onUnmounted } from "vue";
import { useStore } from "vuex";
import { useRoute } from "vue-router";
import OutputLine from "@/frontend/components/OutputLine.vue";
import QuizOutputLine from "@/frontend/components/QuizOutputLine.vue";
import MatchOutputLine from "@/frontend/components/MatchOutputLine.vue";
import SetGrid from "@/frontend/components/SetGrid.vue";
import { normalizePage, type Card } from "@/common/interfaces/ConfigFile";
import { TTS } from "@/frontend/utils/TTS";
import EyeButton from "@/frontend/components/EyeButton.vue";
import GazePauseButton from "@/frontend/components/GazePauseButton.vue";
import { Telemetry } from "@/frontend/utils/Telemetry";
import LayoutSettingsPanel from "../components/LayoutSettingsPanel.vue";
import {
  advanceQuizPage,
  getSolvedMatchPairCount,
  getTotalMatchPairs,
  isPlayableMatchPage,
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
const quizDialogOpen = ref(false);
const quizFeedback = ref("");
const answerCardId = ref<string | null>(null);
const answerCorrect = ref(false);
const interactionBusy = ref(false);
let interactionRevision = 0;
let advanceTimer: ReturnType<typeof setTimeout> | undefined;
const loadError = ref(false);
const matchErrors = ref(0);
const matchMessage = ref("Найдите все связи между верхней и нижней строками");
const selectedCardId = ref<string | null>(null);
const matchedCardIds = ref<string[]>([]);
const solvedMatchPairIds = ref<string[]>([]);

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
  get(): number {
    return Math.max(0, Math.min(totalPages.value - 1, store.state.explorer.page ?? 0));
  },
  set(value: number) {
    const next = Math.max(0, Math.min(totalPages.value - 1, value));
    store.commit("explorer_page", next);
  }
});

const currentPage = computed(() => {
  return normalizePage(
    config.value?.pages?.[page.value] ?? {
      mode: "standard",
      columns: 3,
      rows: 3,
      cards: []
    }
  );
});

const interfaceOutputLine = computed(() => store.state.ui.outputLine);
const isQuiz = computed(() => currentPage.value.mode === "quiz");
const isMatch = computed(() => currentPage.value.mode === "match");
const matchTopColumns = computed(() => currentPage.value.topColumns ?? currentPage.value.columns);
const matchBottomColumns = computed(
  () => currentPage.value.bottomColumns ?? currentPage.value.columns
);
const isValidMatch = computed(
  () =>
    !isMatch.value ||
    isPlayableMatchPage(currentPage.value.cards, matchTopColumns.value, matchBottomColumns.value)
);
const quizAutoNext = computed(() => config.value?.quizAutoNext);

const showStandardOutput = computed(() => {
  return interfaceOutputLine.value && !isQuiz.value && !isMatch.value && !isSettingsOpened.value;
});

const showGridExitButton = computed(() => {
  return store.state.ui.exitButton && !showStandardOutput.value;
});

const totalPairs = computed(() => {
  return getTotalMatchPairs(
    currentPage.value.cards,
    matchTopColumns.value,
    matchBottomColumns.value
  );
});

const solvedPairs = computed(() => getSolvedMatchPairCount(solvedMatchPairIds.value));

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

function resetInteractivePageState() {
  interactionRevision++;
  clearTimeout(advanceTimer);
  interactionBusy.value = false;
  quizFeedback.value = "";
  answerCardId.value = null;
  waitingForNext.value = false;
  quizFinished.value = false;
  selectedCardId.value = null;
  matchedCardIds.value = [];
  solvedMatchPairIds.value = [];
  matchErrors.value = 0;
  matchMessage.value = "Найдите все связи между верхней и нижней строками";
}

onUnmounted(() => {
  interactionRevision++;
  clearTimeout(advanceTimer);
});

function restartQuiz() {
  resetInteractivePageState();
  page.value = 0;
  quizErrors.value = 0;
}

async function loadSet(nextFilename: string) {
  loadError.value = false;
  store.commit("explorer_config", undefined);
  cards.value = [];
  quizErrors.value = 0;
  resetInteractivePageState();
  try {
    await store.dispatch("open_file", nextFilename);
    if (!store.state.explorer.config) {
      loadError.value = true;
      return;
    }
    await store.dispatch("editor_current", nextFilename);
    filename.value = nextFilename;
    Telemetry.product("openSet");
  } catch {
    store.commit("explorer_config", undefined);
    loadError.value = true;
  }
}

function advancePage() {
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

function advanceQuiz() {
  advancePage();
}

async function addCard(card: Card, index: number) {
  if (interactionBusy.value || (isQuiz.value && (quizDialogOpen.value || quizFinished.value)))
    return;
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

async function onQuizCard(card: Card) {
  const result = handleQuizCard(
    card,
    {
      errors: quizErrors.value,
      page: page.value,
      quizFinished: quizFinished.value,
      totalPages: totalPages.value,
      waitingForNext: waitingForNext.value
    },
    quizAutoNext.value
  );
  if (result.ignored) return;
  const revision = interactionRevision;
  interactionBusy.value = true;
  answerCardId.value = card.id;
  answerCorrect.value = !!card.answer;
  quizFeedback.value = card.answer
    ? "Верно. Можно продолжить"
    : quizAutoNext.value
      ? "Неверный ответ. Переходим дальше"
      : "Попробуйте ещё раз";
  quizErrors.value = result.errors;
  waitingForNext.value = result.waitingForNext;
  try {
    if (result.feedbackText) await TTS.instance.forcePlayText(result.feedbackText);
  } catch {
    if (revision === interactionRevision) quizFeedback.value += ". Озвучка недоступна";
  } finally {
    if (revision === interactionRevision) {
      page.value = result.page;
      quizFinished.value = result.quizFinished;
      interactionBusy.value = false;
    }
  }
}

async function onMatchCard(card: Card, index: number) {
  if (!filename.value) return;
  const result = handleMatchCard(card, index, {
    cards: currentPage.value.cards,
    columns: matchTopColumns.value,
    bottomColumns: matchBottomColumns.value,
    matchErrors: matchErrors.value,
    matchedCardIds: matchedCardIds.value,
    page: page.value,
    selectedCardId: selectedCardId.value,
    solvedPairIds: solvedMatchPairIds.value,
    totalPages: totalPages.value
  });
  if (result.ignored) return;
  const revision = interactionRevision;
  interactionBusy.value = true;
  selectedCardId.value = result.selectedCardId;
  matchedCardIds.value = result.matchedCardIds;
  solvedMatchPairIds.value = result.solvedPairIds;
  matchErrors.value = result.matchErrors;
  matchMessage.value = result.matchMessage;

  try {
    if (result.shouldPlayCard) await TTS.instance.playCards(filename.value, [card], true);
    if (revision !== interactionRevision) return;
    if (result.feedbackText) await TTS.instance.forcePlayText(result.feedbackText);
  } catch {
    if (revision === interactionRevision) matchMessage.value += ". Озвучка недоступна";
  } finally {
    if (revision === interactionRevision) {
      interactionBusy.value = false;
      if (result.advancePageAfterSolved) {
        advanceTimer = setTimeout(() => {
          if (revision === interactionRevision) page.value++;
        }, 700);
      }
    }
  }
}
</script>
<style scoped>
.compact-controls {
  display: grid;
  grid-template-columns: 1fr 9fr;
  height: 150px;
}
.compact-controls > span {
  align-self: center;
  padding: 16px;
  font-size: 22px;
}
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
.set-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  min-height: 0;
  height: 100%;
  padding: 24px;
  text-align: center;
  color: var(--linka-text);
}
.state-action {
  width: min(100%, 320px);
  height: 96px;
  font-size: 20px;
}
</style>
