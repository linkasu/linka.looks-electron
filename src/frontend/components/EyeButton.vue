<template>
  <button ref="elRef" class="eyebtn" :class="{ eye: buttonEnabled && !props.editor, isInside, lock }"
    :style="{ background: `rgb(var(--v-theme-${color}))`, borderWidth }" :disabled="!buttonEnabled" @click="click()">
    <slot />
    <div v-if="isInside || (!buttonEnabled && !lock)" class="overlay" :class="{ disabled: !buttonEnabled && !lock }">
      <div v-if="circle" class="progress-bar" :style="{ '--seconds': seconds, '--size': size }">
        <progress min="0" :max="buttonTimeout" style="visibility: hidden; height: 0; width: 0" />
      </div>
    </div>
  </button>
</template>

<script lang="ts" setup>
import type { Ref } from "vue";
import { ref, onMounted, defineProps, computed } from "vue";
import { useStore } from "vuex";

interface IEyeButtonProps {
  disabled?: boolean
  lock?: boolean
  color?: string
  path?: boolean
  editor?: boolean
}

const props = withDefaults(defineProps<IEyeButtonProps>(), {
  disabled: false,
  lock: false,
  path: false
});

const store = useStore();

const elRef: Ref<Element | null> = ref(null);
const isInside = ref(false);
const circle = ref(false);
const timer: Ref<NodeJS.Timeout | null> = ref(null);

const borderWidth = computed(() => {
  return store.state.button.borders + "px";
});

const buttonTimeout = computed(() => {
  return store.state.button.timeout;
});

onMounted(() => {
  const el = elRef.value;
  el?.addEventListener("eye-enter", (event) => {
    const e = event as CustomEvent;
    const eye = !!e.detail.eye;
    if (props.editor) return;
    if (buttonEnabled.value || props.lock) onEnter(eye);
  });
  el?.addEventListener("eye-exit", () => {
    onExit();
  });
});

const buttonEnabled = computed(() => {
  return store.state.button.enabled && !props.disabled;
});

const size = computed(() => {
  if (!elRef.value) return 0 + "px";
  const rect = (elRef.value as HTMLButtonElement).getBoundingClientRect();
  return Math.min(rect.width, rect.height) * 0.8 + "px";
});

const seconds = computed(() => {
  return buttonTimeout.value / 1000 + "s";
});

function onExit () {
  isInside.value = false;
  circle.value = false;
}

function onEnter (eye: boolean) {
  if (eye && !store.state.button.eyeSelect) return;
  if (!eye && !store.state.button.keyboardActivation) return;
  if (!eye && !store.state.button.joystickActivation) return;
  isInside.value = true;
  circle.value = store.state.button.eyeActivation && eye;
}

function click () {
  if (!store.state.button.clickSound) return;
  const el = document.getElementById("button_audio") as HTMLAudioElement;
  el.currentTime = 0;
  el.play();
}
</script>

<style scoped>
.overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.05);
}

.disabled {
  background: rgba(0, 0, 0, 0.5);
}

.eyebtn {
  position: relative;
  border: 1px solid rgb(var(--v-theme-secondary));
  overflow: hidden;
  width: 100%;
  height: 100%;
}

.isInside {
  background-color: rgb(var(--v-theme-secondary)) !important;
}

canvas {
  position: absolute;
  left: 0;
  top: 0;
}

@property --progress-value {
  syntax: '<integer>';
  initial-value: 0;
  inherits: false;
}

@keyframes progress {
  to {
    --progress-value: 100;
  }
}

.progress-bar {
  display: flex;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  justify-content: center;
  align-items: center;

  width: var(--size);
  height: var(--size);
  border-radius: 50%;
  background: radial-gradient(closest-side, transparent 79%, transparent 80% 100%),
    conic-gradient(rgba(var(--v-theme-primary), 0.5) calc(var(--progress-value) * 1%),
      transparent 0);
  animation: progress 1s infinite forwards;
  animation-duration: var(--seconds);
  animation-timing-function: linear;
}
</style>
