<template>
  <v-dialog
    v-model="dialog"
    width="auto"
  >
    <template #activator="{ props }">
      <v-btn
        color="error"
        flat
        icon=""
        v-bind="props"
      >
        <v-icon>mdi-delete-forever</v-icon>
      </v-btn>
    </template>

    <v-card min-width="300px">
      <v-card-title primary-title>
        Удалить {{ file }}?
      </v-card-title>
      <v-card-text> Вы уверены? </v-card-text>
      <v-card-actions>
        <v-btn
          color="error"
          @click="
            emit('delete'),
            dialog = false
          "
        >
          Да
        </v-btn>
        <v-btn
          color="primary"
          @click="dialog = false"
        >
          Нет
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { ref, defineProps, defineEmits } from "vue";

const props = defineProps<{ file: string }>();
const emit = defineEmits<{(e: "delete"): void }>();

const dialog = ref(false);
</script>
