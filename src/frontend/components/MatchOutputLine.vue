<template>
  <v-layout class="output-line">
    <gaze-pause-button />
    <div class="attempts" :aria-label="`Ошибок: ${errors}`">
      <span>Ошибок</span>
      <strong>{{ errors }}</strong>
    </div>
    <div class="message" role="status" aria-live="polite">
      <span>{{ message }}</span>
      <small v-if="message.startsWith('Неверная пара')"
        >Первый выбор сохранён. Выберите другую карточку в другой строке.</small
      >
    </div>
    <h1 :aria-label="`Найдено пар: ${solvedPairs} из ${totalPairs}`">
      <span>Найдено пар</span>{{ solvedPairs }} / {{ totalPairs }}
    </h1>
  </v-layout>
</template>

<script lang="ts" setup>
import GazePauseButton from "./GazePauseButton.vue";
defineProps<{
  errors: number;
  message: string;
  solvedPairs: number;
  totalPairs: number;
}>();
</script>

<style scoped>
.output-line {
  height: 150px;
  display: grid;
  grid-template-columns: 1fr 1fr minmax(0, 6fr) 2fr;
  align-items: center;
  background: var(--linka-surface);
}

.message {
  font-size: clamp(18px, 2.2vw, 28px);
  padding: 0 16px;
  max-height: 100%;
  overflow: auto;
}
.message small {
  display: block;
  margin-top: 8px;
  font-size: clamp(14px, 1.4vw, 18px);
  color: var(--linka-muted);
}

h1 {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  font-size: clamp(20px, 2.5vw, 32px);
}
h1 span {
  font-size: 14px;
  font-weight: 400;
  color: var(--linka-muted);
}
.attempts {
  display: grid;
  justify-items: center;
  color: var(--linka-muted);
  font-size: 14px;
}
.attempts strong {
  font-size: 24px;
}
</style>
