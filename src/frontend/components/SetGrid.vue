<template>
  <div class="grid">
    <div class="left-grid">
      <eye-button v-if="showExitButton" color="accent" @click="$router.back()">
        <v-icon>mdi-exit-run</v-icon>
      </eye-button>
      <eye-button
        v-if="showPagination"
        color="primary"
        lock
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
        :disabled="isCardDisabled(placement.card)"
        :style="
          currentPage.mode === 'match'
            ? cardPosition(placement.index)
            : getPlacementStyle(placement)
        "
        :class="{
          active: selectedCardId === placement.card.id,
          matched: matchedCardIds.includes(placement.card.id)
        }"
        @click="emit('card', placement.card, placement.index)"
      />
    </div>

    <eye-button
      v-if="showPagination"
      color="primary"
      lock
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
  return currentPage.value.mode !== "quiz" && totalPages.value > 1;
});

const matchedCardIds = computed(() => props.matchedCardIds ?? []);
const selectedCardId = computed(() => props.selectedCardId ?? null);
const isPageTurnEyeDisabled = computed(() => store.state.button.pageTurnMode === "mouseOnly");

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
  border-top: 1px solid black;
  display: grid;
  grid-template-columns: 1fr 8fr 1fr;
  height: 100%;
  min-height: 0;
}
.cards {
  display: grid;
  grid-template-columns: repeat(var(--columns), 1fr);
  grid-template-rows: repeat(var(--rows), calc(100% / var(--rows)));
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
  border: 3px solid rgb(var(--v-theme-secondary));
}
.matched {
  opacity: 0.6;
}
</style>
