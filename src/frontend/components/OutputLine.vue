<template>
  <v-layout full-height class="output-line" :class="{ 'output-line-back': isExitButton }">
    <gaze-pause-button />
    <eye-button
      v-if="isExitButton"
      color="accent"
      aria-label="Вернуться к наборам"
      @click="$router.back()"
    >
      <v-icon>mdi-folder-outline</v-icon>
      <span class="control-label">К наборам</span>
    </eye-button>
    <eye-button
      class="output-block"
      :aria-label="isPlaying ? 'Сообщение звучит' : 'Произнести сообщение'"
      :aria-busy="isPlaying"
      @click="say"
    >
      <div class="speak-control">
        <v-icon :color="isPlaying ? 'success' : ''">mdi-account-voice</v-icon>
        <span>{{ isPlaying ? "Говорю…" : "Произнести" }}</span>
      </div>
      <div ref="outputTextRef" class="output-text">
        <div v-if="withoutSpace" class="text">{{ text }}<span class="cursor">|</span></div>
        <div v-else class="cards">
          <set-grid-button
            v-for="(card, i) in clone"
            :key="i"
            editor
            preview
            :card="card"
            :file="file"
            class="card"
          />
        </div>
      </div>
    </eye-button>
    <eye-button color="accent" aria-label="Убрать последнее" @click="backspace">
      <v-icon> mdi-backspace </v-icon>
      <span class="control-label">Убрать</span>
    </eye-button>
    <eye-button
      color="accent"
      :aria-label="canRestore ? 'Вернуть сообщение' : 'Очистить сообщение'"
      @click="canRestore ? restore() : clear()"
    >
      <v-icon>{{ canRestore ? "mdi-undo" : "mdi-delete-outline" }}</v-icon>
      <span class="control-label">{{ canRestore ? "Вернуть" : "Очистить" }}</span>
    </eye-button>
  </v-layout>
</template>

<script lang="ts" setup>
import type { Ref } from "vue";
import { nextTick, ref, computed, watch } from "vue";
import { useStore } from "vuex";

import EyeButton from "@/frontend/components/EyeButton.vue";
import GazePauseButton from "./GazePauseButton.vue";
import SetGridButton from "@/frontend/components/SetGridButton.vue";
import { CardType, type Card, type ConfigFile } from "@/common/interfaces/ConfigFile";
import { TTS } from "@/frontend/utils/TTS";

interface IOutputLineProps {
  file: string;
  cards: Card[];
  config?: ConfigFile;
}

const props = defineProps<IOutputLineProps>();
const store = useStore();
const emit = defineEmits<{
  (e: "value", payload: Card[]): void;
}>();

const isPlaying = ref(false);
const clearedCards = ref<Card[]>([]);
const canRestore = computed(() => props.cards.length === 0 && clearedCards.value.length > 0);
const outputTextRef: Ref<Element | null> = ref(null);

const isExitButton = computed(() => {
  return store.state.ui.exitButton;
});

const withoutSpace = computed(() => {
  return props.config?.withoutSpace;
});

const clone = computed(() => {
  return [...props.cards];
});

watch(
  () => props.cards.length,
  async () => {
    await nextTick();
    scrollEnd();
  }
);

const text = computed(() => {
  return clone.value
    .map((c: Card) => {
      return c.cardType === CardType.AudioCard ? c.title : " ";
    })
    .join("");
});

function scrollEnd() {
  const el = outputTextRef.value;
  if (el) el.scrollLeft = el.scrollWidth;
}

function clear() {
  if (!props.cards.length) return;
  clearedCards.value = [...props.cards];
  emit("value", []);
}

function restore() {
  if (!canRestore.value) return;
  emit("value", [...clearedCards.value]);
  clearedCards.value = [];
}

watch(
  () => props.file,
  () => {
    clearedCards.value = [];
  }
);
watch(
  () => props.cards.length,
  (length) => {
    if (length > 0) clearedCards.value = [];
  }
);

function backspace() {
  emit("value", clone.value.slice(0, -1));
}

async function say() {
  if (isPlaying.value) return;
  isPlaying.value = true;
  try {
    if (props.config?.withoutSpace) {
      if (text.value) await TTS.instance.playText(text.value);
    } else await TTS.instance.playCards(props.file, props.cards);
  } finally {
    isPlaying.value = false;
  }
}
</script>

<style scoped>
.output-line {
  height: 150px;
  display: grid;
  grid-template-columns: 1fr minmax(0, 7fr) 1fr 1fr;
  min-width: 0;
}
.output-line-back {
  grid-template-columns: 1fr 1fr minmax(0, 6fr) 1fr 1fr;
}

.text {
  font-size: clamp(28px, 5vw, 60px);
  line-height: 1.4;
  padding: 18px 8px;
  white-space: nowrap;
  vertical-align: middle;
  text-align: left;
}
.output-text {
  display: block;
  width: 100%;
  height: 100%;
  overflow-x: auto;
  min-width: 0;
}

.output-block {
  display: grid;
  grid-template-columns: 1fr minmax(0, 6fr);
  overflow: hidden;
}
.speak-control {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 4px;
  gap: 8px;
  height: 100%;
  font-size: clamp(11px, 1.2vw, 16px);
}

.cards {
  height: 100%;
  display: inline-flex;
  max-width: max-content;
}
.card {
  box-shadow: none;
  border: none;
  height: 100%;
  flex: 0 0 150px;
  width: 150px;
}

.cursor {
  animation: blink 1s linear;
  animation-iteration-count: infinite;
  animation-timing-function: step-start;
}
.control-label {
  display: block;
  font-size: clamp(10px, 1.1vw, 16px);
  margin-top: 8px;
  overflow-wrap: anywhere;
}
@media (prefers-reduced-motion: reduce) {
  .cursor {
    animation: none;
  }
}
:global(.reduce-motion) .cursor {
  animation: none;
}
@keyframes blink {
  0% {
    color: rgba(255, 255, 255, 0);
  }
  100% {
    color: #000;
  }
}
</style>
