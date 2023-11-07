<template>
  <v-layout
    full-height
    class="output-line"
    :class="{ 'output-line-back': isExitButton }"
  >
    <eye-button
      v-if="isExitButton"
      color="accent"
      @click="$router.back()"
    >
      <v-icon>mdi-exit-run</v-icon>
    </eye-button>
    <eye-button
      lock
      :color="buttonEnabled ? 'accent' : ''"
      @click="switchButtonEnabled"
    >
      <v-icon>{{ buttonEnabled ? 'mdi-eye' : 'mdi-eye-off' }}</v-icon>
    </eye-button>
    <eye-button
      class="output-block"
      @click="say"
    >
      <v-icon
        block
        class="speaker-icon"
        :color="isPlaying ? 'success' : ''"
      >
        mdi-account-voice
      </v-icon>
      <div
        ref="text"
        class="output-text"
      >
        <div
          v-if="withoutSpace"
          class="text"
        >
          {{ text }}<span class="cursor">|</span>
        </div>
        <div
          v-else
          class="cards"
        >
          <set-grid-button
            v-for="(card, i) in clone"
            :key="i"
            :enabled="false"
            :card="card"
            :file="file"
            class="card"
          />
        </div>
      </div>
    </eye-button>
    <eye-button
      color="accent"
      @click="backspace"
    >
      <v-icon> mdi-backspace </v-icon>
    </eye-button>
    <eye-button
      color="accent"
      @click="clear"
    >
      <v-icon> mdi-delete </v-icon>
    </eye-button>
  </v-layout>
</template>

<script lang="ts" setup>
import type { Ref } from "vue";
import { ref, computed, defineProps, defineEmits } from "vue";
import { useStore } from "vuex";

import EyeButton from "@/frontend/components/EyeButton.vue";
import SetGridButton from "@/frontend/components/SetGridButton.vue";
import { CardType, type Card, type ConfigFile } from "@/common/interfaces/ConfigFile";
import { TTS } from "@/frontend/utils/TTS";

interface IOutputLineProps {
  file: string
  cards: Card[]
  config?: ConfigFile
}

const props = defineProps<IOutputLineProps>();
const store = useStore();
const emit = defineEmits<{
  (e: "value", payload: Card[]): void
}>();

const isPlaying = ref(false);
const outputTextRef: Ref<Element | null> = ref(null);

const isExitButton = computed(() => {
  return store.state.ui.exitButton;
});

const buttonEnabled = computed(() => {
  return store.state.button.enabled;
});

const withoutSpace = computed(() => {
  return props.config?.withoutSpace;
});

const clone = computed(() => {
  scrollEnd();

  return [...props.cards];
});

const text = computed(() => {
  return clone.value
    .map((c: Card) => {
      return c.cardType === CardType.AudioCard ? c.title : " ";
    })
    .join("");
});

function switchButtonEnabled () {
  store.dispatch("button_enabled");
}

function scrollEnd () {
  setTimeout(() => {
    const el = outputTextRef.value as HTMLButtonElement;
    if (el && el.firstElementChild) {
      el.scrollTo({
        left: el.firstElementChild.scrollWidth + 100
      });
    }
  }, 50);
}

function clear () {
  emit("value", []);
}

function backspace () {
  emit("value", clone.value.slice(0, -1));
}

async function say () {
  isPlaying.value = true;
  if (props.config?.withoutSpace) {
    if (text.value) await TTS.instance.playText(text.value);
  } else await TTS.instance.playCards(props.file, props.cards);
  isPlaying.value = false;
}
</script>

<style scoped>
.eye-button {
  /* background-color: #; */
}
.output-line {
  height: 150px;
  display: grid;
  grid-template-columns: 1fr 7fr 1fr 1fr;
}
.output-line-back {
  grid-template-columns: 1fr 1fr 6fr 1fr 1fr;
}

.text {
  margin-top: 22.5px;
  font-size: 60px;
  vertical-align: middle;
  text-align: left;
}
.output-text {
  display: block;
  width: 100%;
  height: 100%;
  overflow-x: scroll;
}

.output-block {
  display: grid;
  grid-template-columns: 1fr 6fr;
  overflow: hidden;
}
.speaker-icon {
  width: 100%;
  height: 100%;
}

.cards {
  height: 100%;
  display: inline-flex;
  max-width: max-content;
}
.card {
  box-shadow: none;
  height: 100%;
  width: 150px;
}

.cursor {
  animation: blink 1s linear;
  animation-iteration-count: infinite;
  animation-timing-function: step-start;
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
