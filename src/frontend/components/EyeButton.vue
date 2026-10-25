<template>
  <button
    ref="elRef"
    class="eyebtn"
    :class="{ eye: buttonEnabled && !props.editor, isInside, isActivated, lock }"
    :data-eye-disabled="props.eyeDisabled ? '1' : null"
    :style="{ background: `rgb(var(--v-theme-${color}))`, borderWidth }"
    :disabled="nativeDisabled"
    @click="click()"
  >
    <slot />
    <div
      v-if="isInside || (!buttonEnabled && !lock)"
      class="overlay"
      :class="{ disabled: !buttonEnabled && !lock }"
    >
      <div
        v-if="circle"
        class="progress-bar"
        :style="{ '--seconds': seconds, '--size': size }"
        @animationend="onProgressEnd"
      >
        <progress min="0" :max="buttonTimeout" style="visibility: hidden; height: 0; width: 0" />
      </div>
    </div>
  </button>
</template>

<script lang="ts" setup>
import type { Ref } from "vue";
import { ref, onBeforeUnmount, onMounted, computed } from "vue";
import { useStore } from "vuex";

interface IEyeButtonProps {
  disabled?: boolean;
  lock?: boolean;
  color?: string;
  path?: boolean;
  editor?: boolean;
  eyeDisabled?: boolean;
}

const BUMP_DURATION_MS = 240;

const props = withDefaults(defineProps<IEyeButtonProps>(), {
  disabled: false,
  lock: false,
  path: false,
  eyeDisabled: false
});

const store = useStore();

const elRef: Ref<Element | null> = ref(null);
const isInside = ref(false);
const circle = ref(false);
const isActivated = ref(false);
let bumpTimer: ReturnType<typeof setTimeout> | null = null;

const borderWidth = computed(() => {
  return store.state.button.borders + "px";
});

const buttonTimeout = computed(() => {
  return store.state.button.timeout;
});

function clearBumpTimer() {
  if (bumpTimer !== null) {
    clearTimeout(bumpTimer);
    bumpTimer = null;
  }
}

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

onBeforeUnmount(() => {
  clearBumpTimer();
});

const buttonEnabled = computed(() => {
  if (props.editor) {
    return !props.disabled;
  }
  return store.state.button.enabled && !props.disabled;
});

const nativeDisabled = computed(() => {
  if (props.lock) return props.disabled;
  return !buttonEnabled.value;
});

const size = computed(() => {
  if (!elRef.value) return 0 + "px";
  const rect = (elRef.value as HTMLButtonElement).getBoundingClientRect();
  return Math.min(rect.width, rect.height) * 0.8 + "px";
});

const seconds = computed(() => {
  return buttonTimeout.value / 1000 + "s";
});

function onExit() {
  isInside.value = false;
  circle.value = false;
}

function onProgressEnd() {
  circle.value = false;
}

function onEnter(eye: boolean) {
  if (eye && props.eyeDisabled) return;
  if (eye && !store.state.button.eyeSelect && !props.lock) return;
  if (!eye && !store.state.button.keyboardActivation) return;
  if (!eye && !store.state.button.joystickActivation) return;
  isInside.value = true;
  circle.value = (store.state.button.eyeActivation || props.lock) && eye;
}

function triggerActivationBump() {
  if (props.editor) return;
  clearBumpTimer();
  isActivated.value = true;
  bumpTimer = setTimeout(() => {
    isActivated.value = false;
    bumpTimer = null;
  }, BUMP_DURATION_MS);
}

function click() {
  circle.value = false;
  triggerActivationBump();
  if (!store.state.button.clickSound) return;
  const el = document.getElementById("button_audio") as HTMLAudioElement | null;
  if (!el) return;
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
  background: rgba(0, 0, 0, 0.04);
  pointer-events: none;
  transition: background-color 180ms ease;
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
  transition:
    background-color 180ms ease,
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 180ms ease;
}

.isInside {
  background-color: rgb(var(--v-theme-secondary)) !important;
}

.isActivated {
  animation: eye-bump 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

canvas {
  position: absolute;
  left: 0;
  top: 0;
}

@property --progress-value {
  syntax: "<number>";
  initial-value: 0;
  inherits: false;
}

@keyframes progress {
  0% {
    --progress-value: 0;
    opacity: 0.85;
    transform: translate(-50%, -50%) scale(0.96);
  }
  70% {
    opacity: 0.4;
    transform: translate(-50%, -50%) scale(1);
  }
  100% {
    --progress-value: 100;
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.02);
  }
}

@keyframes eye-bump {
  0% {
    transform: scale(1);
  }
  35% {
    transform: scale(0.965);
  }
  72% {
    transform: scale(1.025);
    box-shadow: inset 0 0 0 3px rgba(var(--v-theme-primary), 0.45);
  }
  100% {
    transform: scale(1);
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
  pointer-events: none;

  width: var(--size);
  height: var(--size);
  border-radius: 50%;
  background: conic-gradient(
    rgba(var(--v-theme-primary), 0.65) calc(var(--progress-value) * 1%),
    rgba(var(--v-theme-primary), 0.08) 0
  );
  -webkit-mask: radial-gradient(closest-side, transparent 78%, #000 81%);
  mask: radial-gradient(closest-side, transparent 78%, #000 81%);
  animation: progress var(--seconds) cubic-bezier(0.25, 0.46, 0.45, 0.94) 1 forwards;
}
</style>
