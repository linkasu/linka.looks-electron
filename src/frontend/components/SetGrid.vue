<template>
  <div
    class="grid"
    :class="{
      'grid--no-pagination': !showPagination,
      'grid--no-controls': !showPagination && !showExitButton
    }"
  >
    <div class="left-grid">
      <eye-button
        v-if="showExitButton"
        color="accent"
        :disabled="interactionBlocked"
        aria-label="Вернуться к наборам"
        @click="$router.back()"
      >
        <v-icon>mdi-folder-outline</v-icon>
        <span class="control-label">К наборам</span>
      </eye-button>
      <eye-button
        v-if="showPagination"
        color="accent"
        lock
        :disabled="interactionBlocked"
        aria-label="Предыдущая страница"
        :eye-disabled="isPageTurnEyeDisabled"
        @click="changePage(-1)"
      >
        <v-icon> mdi-arrow-left </v-icon>
      </eye-button>
    </div>

    <div
      class="cards"
      :style="{
        '--rows': currentPage.mode === 'match' ? 2 : currentPage.rows,
        '--columns': currentPage.mode === 'match' ? matchGridColumns : currentPage.columns
      }"
    >
      <set-grid-button
        v-for="placement in visiblePlacements"
        :key="placement.card.id"
        :card="placement.card"
        :file="file"
        :disabled="interactionBlocked || isCardDisabled(placement.card)"
        :aria-pressed="selectedCardId === placement.card.id"
        :aria-description="
          answerCardId === placement.card.id
            ? answerCorrect
              ? 'Верный ответ'
              : 'Неверный ответ'
            : undefined
        "
        :style="
          currentPage.mode === 'match'
            ? cardPosition(placement.index)
            : getPlacementStyle(placement)
        "
        :class="{
          active: selectedCardId === placement.card.id,
          matched: matchedCardIds.includes(placement.card.id),
          'answer-correct': answerCardId === placement.card.id && answerCorrect,
          'answer-wrong': answerCardId === placement.card.id && !answerCorrect
        }"
        @click="emit('card', placement.card, placement.index)"
      />
    </div>

    <eye-button
      v-if="showPagination"
      color="accent"
      lock
      :disabled="interactionBlocked"
      aria-label="Следующая страница"
      :eye-disabled="isPageTurnEyeDisabled"
      @click="changePage(1)"
    >
      <v-icon> mdi-arrow-right </v-icon>
    </eye-button>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, watch } from "vue";
import { useStore } from "vuex";
import type { CardGridPlacement, ConfigFile, Card, SetPage } from "@/common/interfaces/ConfigFile";
import { CardType, getCardGridPlacements, normalizePage } from "@/common/interfaces/ConfigFile";
import EyeButton from "@/frontend/components/EyeButton.vue";
import SetGridButton from "@/frontend/components/SetGridButton.vue";
import { PageWatcher } from "@linkasu/tobii-electron/renderer";

interface ISetGridProps {
  config: ConfigFile;
  file: string;
  page: number;
  showExitButton?: boolean;
  matchedCardIds?: string[];
  selectedCardId?: string | null;
  interactionBlocked?: boolean;
  answerCardId?: string | null;
  answerCorrect?: boolean;
}

const store = useStore();

const props = withDefaults(defineProps<ISetGridProps>(), {
  showExitButton: false,
  matchedCardIds: () => [],
  selectedCardId: null
});

const emit = defineEmits<{
  (e: "update:page", payload: number): void;
  (e: "card", payload: Card, index: number): void;
}>();

const totalPages = computed(() => Math.max(1, props.config.pages?.length ?? 0));

const currentPageIndex = computed(() => {
  return Math.max(0, Math.min(totalPages.value - 1, props.page ?? 0));
});

const currentPage = computed<SetPage>(() => {
  return normalizePage(
    props.config.pages?.[currentPageIndex.value] ?? {
      mode: "standard",
      columns: 3,
      rows: 3,
      cards: []
    }
  );
});

const placements = computed(() => getCardGridPlacements(currentPage.value));

const visiblePlacements = computed(() =>
  placements.value.filter(
    (placement) =>
      !placement.covered &&
      (currentPage.value.mode !== "match" || placement.card.cardType !== CardType.NewCard)
  )
);

function getPlacementStyle(placement: CardGridPlacement) {
  return {
    gridColumn: `${placement.column} / span ${placement.width}`,
    gridRow: `${placement.row} / span ${placement.height}`
  };
}

const topColumns = computed(() => currentPage.value.topColumns ?? currentPage.value.columns);
const bottomColumns = computed(() => currentPage.value.bottomColumns ?? currentPage.value.columns);
const matchGridColumns = computed(() =>
  Math.max(
    topColumns.value,
    bottomColumns.value,
    currentPage.value.cards.length - topColumns.value,
    1
  )
);

const showPagination = computed(() => {
  return (
    store.state.button.pageTurnMode !== "hidden" &&
    currentPage.value.mode !== "quiz" &&
    totalPages.value > 1
  );
});

const matchedCardIds = computed(() => props.matchedCardIds ?? []);
const selectedCardId = computed(() => props.selectedCardId ?? null);
const isPageTurnEyeDisabled = computed(
  () => !store.state.button.enabled || store.state.button.pageTurnMode === "mouseOnly"
);

watch(() => props.page, onPageChanged);
watch(currentPage, () => {
  setTimeout(() => PageWatcher.instance?.watchElementsChange(true), 10);
});

onMounted(() => {
  store.commit("explorer_page", currentPageIndex.value);
  setTimeout(() => PageWatcher.instance?.watchElementsChange(true), 10);
});

function changePage(offset: number) {
  const next = Math.max(0, Math.min(totalPages.value - 1, currentPageIndex.value + offset));
  emit("update:page", next);
  store.commit("explorer_page", next);
}

function onPageChanged(page: number) {
  store.commit("explorer_page", Math.max(0, Math.min(totalPages.value - 1, page ?? 0)));
}

function cardPosition(index: number) {
  if (currentPage.value.mode !== "match") return undefined;
  const top = index < topColumns.value;
  return {
    gridRow: top ? 1 : 2,
    gridColumn: top ? index + 1 : index - topColumns.value + 1
  };
}

function isCardDisabled(card: Card): boolean {
  return (
    matchedCardIds.value.includes(card.id) ||
    card.cardType === CardType.EmptyCard ||
    card.cardType === CardType.NewCard
  );
}
</script>

<style scoped>
.grid {
  border-top: 1px solid var(--linka-border);
  display: grid;
  grid-template-columns: 1fr 8fr 1fr;
  height: 100%;
  min-height: 0;
}
.grid--no-pagination {
  grid-template-columns: 1fr 9fr;
}
.grid--no-controls {
  grid-template-columns: minmax(0, 1fr);
}
.grid--no-controls .left-grid {
  display: none;
}
.control-label {
  display: block;
  margin-top: 8px;
  font-size: clamp(12px, 1.2vw, 18px);
}
.cards {
  display: grid;
  grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
  grid-template-rows: repeat(var(--rows), minmax(0, 1fr));
  height: 100%;
  min-height: 0;
}
.left-grid {
  display: grid;
  grid-template-columns: 1fr;
  min-height: 0;
}
.left-grid:has(button + button) {
  grid-template-rows: 2fr 10fr;
}
.left-grid > button,
.grid > button {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
.active {
  background: rgb(var(--v-theme-accent));
  outline: 4px solid rgb(var(--v-theme-primary));
  outline-offset: -6px;
}
.active::after,
.answer-correct::after,
.answer-wrong::after {
  position: absolute;
  top: 8px;
  left: 8px;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: clamp(12px, 1.5vw, 20px);
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}
.active::after {
  content: "Выбрано";
}
.answer-correct::after {
  content: "✓ Верно";
}
.answer-wrong::after {
  content: "× Неверный ответ";
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-error));
  border: 2px solid currentColor;
}
.matched {
  background: rgb(var(--v-theme-accent));
}
.matched::after {
  content: "✓";
  position: absolute;
  top: 6px;
  left: 6px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  font-size: 20px;
  line-height: 28px;
}
</style>
