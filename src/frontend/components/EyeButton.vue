<template>
  <component
    :is="preview ? 'div' : 'button'"
    ref="elRef"
    class="eyebtn"
    :class="{
      eye: (buttonEnabled || (lock && !disabled)) && !editor && !preview,
      isInside,
      lock,
      preview
    }"
    :type="preview ? undefined : 'button'"
    :data-eye-disabled="props.eyeDisabled ? '1' : null"
    :style="{
      background: color ? `rgb(var(--v-theme-${color}))` : undefined,
      color: color ? `rgb(var(--v-theme-on-${color}))` : undefined,
      borderWidth
    }"
    :disabled="preview ? undefined : nativeDisabled"
    @click="click()"
  >
    <slot />
    <div
      v-if="!preview && (isInside || (!buttonEnabled && !lock))"
      class="overlay"
      :class="{ disabled: !buttonEnabled && !lock }"
      aria-hidden="true"
    >
      <div v-if="circle" class="progress-bar" :style="{ '--seconds': seconds, '--size': size }">
        <span class="sr-only">Выбор взглядом</span>
      </div>
    </div>
  </component>
</template>

<script lang="ts" setup>
import type { Ref } from "vue";
import { ref, onMounted, computed, watch } from "vue";
import { useStore } from "vuex";

interface IEyeButtonProps {
  disabled?: boolean;
  lock?: boolean;
  color?: string;
  path?: boolean;
  editor?: boolean;
  eyeDisabled?: boolean;
  preview?: boolean;
}

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
    if (props.editor || props.preview) return;
    if (!nativeDisabled.value) onEnter(eye);
  });
  el?.addEventListener("eye-exit", () => {
    onExit();
  });
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

watch(nativeDisabled, (disabled) => {
  if (disabled) onExit();
});

const size = computed(() => {
  if (!elRef.value) return 0 + "px";
  const rect = (elRef.value as HTMLButtonElement).getBoundingClientRect();
  return Math.min(44, Math.min(rect.width, rect.height) * 0.3) + "px";
});

const seconds = computed(() => {
  return buttonTimeout.value / 1000 + "s";
});

function onExit() {
  isInside.value = false;
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

function click() {
  onExit();
  if (props.preview || !store.state.button.clickSound) return;
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
  pointer-events: none;
  border-radius: inherit;
}

.disabled {
  background: rgba(83, 103, 97, 0.08);
}

.eyebtn {
  position: relative;
  border: 1px solid rgb(var(--v-theme-secondary));
  overflow: hidden;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  border-radius: 12px;
  container-type: size;
}

.isInside {
  box-shadow: inset 0 0 0 3px rgb(var(--v-theme-primary));
}

.eyebtn:disabled {
  cursor: default;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

canvas {
  position: absolute;
  left: 0;
  top: 0;
}

@property --progress-value {
  syntax: "<integer>";
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
  top: 6px;
  right: 6px;
  justify-content: center;
  align-items: center;

  width: var(--size);
  height: var(--size);
  border-radius: 50%;
  background: conic-gradient(
    rgb(var(--v-theme-primary)) calc(var(--progress-value) * 1%),
    rgb(var(--v-theme-secondary)) 0
  );
  mask: radial-gradient(closest-side, transparent calc(100% - 4px), #000 calc(100% - 3px));
  animation: progress 1s forwards;
  animation-duration: var(--seconds);
  animation-timing-function: linear;
}
</style>
