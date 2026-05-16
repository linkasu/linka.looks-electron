<template>
  <v-layout class="output-line">
    <h1>
      <v-icon>mdi-call-split</v-icon>
    </h1>
    <h1>
      <v-icon color="error" :icon="errorIcon" />
    </h1>
    <div class="message">
      {{ message }}
    </div>
    <h1>
      {{ solvedPairs }} / {{ totalPairs }}
    </h1>
  </v-layout>
</template>

<script lang="ts" setup>
import { computed } from "vue";

const props = defineProps<{
  errors: number;
  message: string;
  solvedPairs: number;
  totalPairs: number;
}>();

const errorIcon = computed(() => props.errors > 9 ? "mdi-numeric-9-plus-box" : `mdi-numeric-${props.errors}-box`);
</script>

<style scoped>
.output-line {
  height: 150px;
  display: grid;
  grid-template-columns: 1fr 1fr 6fr 2fr;
  align-items: center;
}

.message {
  font-size: 28px;
  padding: 0 16px;
}

h1 {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
