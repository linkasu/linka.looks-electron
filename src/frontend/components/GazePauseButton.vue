<template>
  <eye-button
    lock
    color="accent"
    class="gaze-pause"
    :class="{ 'gaze-pause--paused': !enabled }"
    :disabled="disabled || store.state.ui?.gazeSuspended"
    :aria-label="enabled ? 'Приостановить управление' : 'Возобновить управление'"
    :aria-pressed="!enabled"
    @click="store.dispatch('button_enabled')"
  >
    <v-icon>{{ enabled ? "mdi-pause" : "mdi-play" }}</v-icon>
    <span>{{ enabled ? "Пауза" : "Продолжить" }}</span>
    <strong v-if="!enabled" role="status">На паузе</strong>
  </eye-button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useStore } from "vuex";
import EyeButton from "./EyeButton.vue";

defineProps<{ disabled?: boolean }>();
const store = useStore();
const enabled = computed(() => store.state.button.enabled);
</script>

<style scoped>
.gaze-pause span,
.gaze-pause strong {
  display: block;
  font-size: clamp(12px, 1.2vw, 18px);
  margin-top: 8px;
  overflow-wrap: anywhere;
}
.gaze-pause--paused {
  box-shadow: inset 0 0 0 3px rgb(var(--v-theme-primary));
}
</style>
