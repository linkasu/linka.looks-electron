<template>
  <v-dialog v-model="dialog" max-width="480">
    <template #activator="{ props }">
      <v-btn
        color="error"
        flat
        :icon="!text"
        :prepend-icon="text ? 'mdi-delete-outline' : undefined"
        v-bind="props"
        title="Удалить набор"
        aria-label="Удалить набор"
      >
        <v-icon v-if="!text">mdi-delete-outline</v-icon>
        {{ text }}
      </v-btn>
    </template>

    <v-card>
      <v-card-title primary-title> Удалить {{ file }}? </v-card-title>
      <v-card-text> Набор будет перемещён в корзину. </v-card-text>
      <v-card-actions>
        <v-btn color="error" variant="flat" @click="(emit('delete'), (dialog = false))">
          Удалить набор
        </v-btn>
        <v-btn @click="dialog = false"> Отмена </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { ref } from "vue";

defineProps<{ file: string; text?: string }>();
const emit = defineEmits<{ (e: "delete"): void }>();

const dialog = ref(false);
</script>
