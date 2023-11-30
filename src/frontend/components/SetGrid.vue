<template>
  <div class="grid">
    <div class="left-grid">
      <eye-button v-if="isExitButton" color="accent" @click="$router.back()">
        <v-icon>mdi-exit-run</v-icon>
      </eye-button>
      <eye-button v-if="!config.quiz" color="primary" @click="page--">
        <v-icon> mdi-arrow-left </v-icon>
      </eye-button>
    </div>

    <div class="cards" :style="{ '--rows': config.rows, '--columns': config.columns }">
      <set-grid-button v-for="card in current" :key="card.id" :card="card" :file="file" @click="emit('card', card)" />
    </div>

    <eye-button v-if="!config.quiz" color="primary" @click="page++">
      <v-icon> mdi-arrow-right </v-icon>
    </eye-button>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, watch, defineProps } from "vue";

import { useStore } from "vuex";

import type { ConfigFile } from "@/common/interfaces/ConfigFile";
import EyeButton from "@/frontend/components/EyeButton.vue";
import SetGridButton from "@/frontend/components/SetGridButton.vue";
import { Card } from "../../common/interfaces/ConfigFile";
import { PageWatcher } from "@/electron/tobii/pageWatch";

interface ISetGridProps {
  config: ConfigFile
  file: string
  quizPage?: number
}

const store = useStore();

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
      Math.min(Math.ceil(props.config.cards.length / pageSize.value) - 1, value)
    );
    setTimeout(() => {
      PageWatcher.instance.watchElementsChange(true);
    }, 10);
  }
});

const current = computed(() => {
  return props.config.cards.slice(pageSize.value * page.value, pageSize.value * (page.value + 1));
});

const pageSize = computed((): number => {
  return props.config.columns * props.config.rows;
});

const isExitButton = computed(() => {
  return store.state.ui.exitButton && !store.state.ui.outputLine;
});

function onQuizPage (p: number) {
  page.value = p;
}
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
