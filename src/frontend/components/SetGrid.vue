<template>
  <div class="grid">
    <div class="left-grid">
      <eye-button v-if="isExitButton" color="accent" @click="$router.back()">
        <v-icon>mdi-exit-run</v-icon>
      </eye-button>
      <v-btn
        v-if="showPagination"
        color="primary"
        tabindex="-1"
        @keydown.prevent
        @keyup.prevent
        @click="changePage(-1)"
      >
        <v-icon> mdi-arrow-left </v-icon>
      </v-btn>
    </div>

    <div class="cards" :style="{ '--rows': currentPage.rows, '--columns': currentPage.columns }">
      <set-grid-button
        v-for="(card, index) in current"
        :key="card.id"
        :card="card"
        :file="file"
        :disabled="isCardDisabled(card)"
        :class="{
          active: selectedCardId === card.id,
          matched: matchedCardIds.includes(card.id)
        }"
        @click="emit('card', card, index)"
      />
    </div>

    <v-btn
      v-if="showPagination"
      color="primary"
      tabindex="-1"
      @keydown.prevent
      @keyup.prevent
      @click="changePage(1)"
    >
      <v-icon> mdi-arrow-right </v-icon>
    </v-btn>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, watch } from "vue";
import { useStore } from "vuex";
import type { ConfigFile, Card, SetPage } from "@/common/interfaces/ConfigFile";
import { CardType, getPageSize, normalizePage } from "@/common/interfaces/ConfigFile";
import EyeButton from "@/frontend/components/EyeButton.vue";
import SetGridButton from "@/frontend/components/SetGridButton.vue";
import { PageWatcher } from "@/electron/tobii/pageWatch";

interface ISetGridProps {
  config: ConfigFile;
  file: string;
  page: number;
  matchedCardIds?: string[];
  selectedCardId?: string | null;
}

const store = useStore();

const props = withDefaults(defineProps<ISetGridProps>(), {
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
  return normalizePage(props.config.pages?.[currentPageIndex.value] ?? {
    mode: "standard",
    columns: 3,
    rows: 3,
    cards: []
  });
});

const current = computed(() => {
  const page = currentPage.value;
  return page.cards.slice(0, getPageSize(page));
});

const isExitButton = computed(() => {
  return store.state.ui.exitButton && !store.state.ui.outputLine;
});

const showPagination = computed(() => {
  return currentPage.value.mode !== "quiz" && totalPages.value > 1;
});

const matchedCardIds = computed(() => props.matchedCardIds ?? []);
const selectedCardId = computed(() => props.selectedCardId ?? null);

watch(() => props.page, onPageChanged);
watch(currentPage, () => {
  setTimeout(() => PageWatcher.instance.watchElementsChange(true), 10);
});

onMounted(() => {
  store.commit("explorer_page", currentPageIndex.value);
  setTimeout(() => PageWatcher.instance.watchElementsChange(true), 10);
});

function changePage (offset: number) {
  const next = Math.max(0, Math.min(totalPages.value - 1, currentPageIndex.value + offset));
  emit("update:page", next);
  store.commit("explorer_page", next);
}

function onPageChanged (page: number) {
  store.commit("explorer_page", Math.max(0, Math.min(totalPages.value - 1, page ?? 0)));
}

function isCardDisabled (card: Card): boolean {
  return matchedCardIds.value.includes(card.id) ||
    card.cardType === CardType.EmptyCard ||
    card.cardType === CardType.NewCard;
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
