<template>
  <div class="grid">
    <div class="left-grid">
      <eye-button v-if="isExitButton" color="accent" @click="$router.back()">
        <v-icon>mdi-exit-run</v-icon>
      </eye-button>
      <eye-button v-if="!config.quiz" color="primary" :eye-disabled="!eyePagination" @click="page--">
        <v-icon> mdi-arrow-left </v-icon>
      </eye-button>
    </div>

    <div class="cards" :style="{ '--rows': rows, '--columns': columns }">
      <set-grid-button v-for="card in current" :key="card.id" :card="card" :file="file" @click="emit('card', card)" />
    </div>

    <eye-button v-if="!config.quiz" color="primary" :eye-disabled="!eyePagination" @click="page++">
      <v-icon> mdi-arrow-right </v-icon>
    </eye-button>
  </div>
</template>

<script lang="ts" setup>

import { ref, computed, watch, defineProps, onMounted, onUnmounted } from "vue";
import { useStore } from "vuex";
import type { ConfigFile } from "@/common/interfaces/ConfigFile";
import EyeButton from "@/frontend/components/EyeButton.vue";
import SetGridButton from "@/frontend/components/SetGridButton.vue";
import { Card, CardType } from "../../common/interfaces/ConfigFile";
import { PageWatcher } from "@/electron/tobii/pageWatch";
import { useRoute } from "vue-router";

interface ISetGridProps {
  config: ConfigFile
  file: string
  quizPage?: number
}

const store = useStore();
const route = useRoute();

const props = defineProps<ISetGridProps>();
const emit = defineEmits<{
  (e: "card", payload: Card): void
}>();

const mpage = ref(0);

watch(() => props.quizPage, onQuizPage);

const page = computed({
  get () {
    return mpage.value;
  },
  set (value) {
    mpage.value = Math.max(
      0,
      Math.min(totalPages.value - 1, value)
    );
    store.commit("explorer_page", mpage.value);
    setTimeout(() => {
      PageWatcher.instance.watchElementsChange(true);
    }, 10);
  }
});

const columns = computed(() => store.state.editor.columns);

const rows = computed(() => store.state.editor.rows);

const current = computed(() => {
  return props.config.cards.slice(pageSize.value * page.value, pageSize.value * (page.value + 1));
});

const lastRealCardIndex = computed(() => {
  if (!props.config.cards?.length) return -1;
  for (let i = props.config.cards.length - 1; i >= 0; i--) {
    const card = props.config.cards[i];
    if (card && card.cardType !== CardType.NewCard) return i;
  }
  return -1;
});

const totalPages = computed((): number => {
  const realCount = lastRealCardIndex.value + 1;
  const realPages = realCount > 0 ? Math.ceil(realCount / pageSize.value) : 1;
  return Math.max(1, realPages);
});

const pageSize = computed((): number => {
  return props.config.columns * props.config.rows;
});

const isExitButton = computed(() => {
  return store.state.ui.exitButton && !store.state.ui.outputLine;
});

const eyePagination = computed(() => {
  return store.state.button.eyePagination;
});

function onQuizPage (p: number) {
  page.value = p;
}

const path = computed(() => {
  return route.params.path.toString();
});

onMounted(async () => {
  await store.dispatch("editor_current", path.value);
  store.commit("explorer_page", page.value);
});

onUnmounted(async () => {
  await store.dispatch("editor_current_default");
});
</script>

<style scoped>
.grid {
  border-top: 1px solid black;
  display: grid;
  grid-template-columns: 1fr 8fr 1fr;
  height: 100%;
}
.cards {
  display: grid;
  grid-template-columns: repeat(var(--columns), 1fr);
  grid-template-rows: repeat(var(--rows), calc(100% / var(--rows)));
}
.left-grid {
  display: grid;
  grid-template-columns: 1fr;
}
.left-grid:has(button + button) {
  grid-template-rows: 2fr 10fr;
}
</style>
