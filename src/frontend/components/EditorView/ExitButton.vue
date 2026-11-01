<template>
  <v-dialog
    :model-value="dialog"
    max-width="480"
    :persistent="disabled"
    @update:model-value="setDialog"
  >
    <template #activator="{ props }">
      <v-btn flat icon="" aria-label="Выйти из редактора" :disabled="disabled" v-bind="props">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
    </template>

    <v-card>
      <v-card-title primary-title> Выйти без сохранения? </v-card-title>
      <v-card-text>Несохранённые изменения будут потеряны.</v-card-text>
      <v-card-actions>
        <v-btn color="error" :disabled="disabled" @click="(emit('exit'), (dialog = false))">
          Выйти без сохранения
        </v-btn>
        <v-btn @click="dialog = false"> Продолжить редактирование </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { ref } from "vue";

const props = withDefaults(defineProps<{ disabled?: boolean; confirm?: boolean }>(), {
  confirm: true
});

const dialog = ref(false);

const emit = defineEmits<{ (e: "exit"): void }>();

function setDialog(value: boolean) {
  if (props.disabled) return;
  if (value && !props.confirm) emit("exit");
  else dialog.value = value;
}
</script>

<style scoped>
.v-card-actions {
  flex-wrap: wrap;
  gap: 8px;
}
.v-card-title,
.v-card-actions :deep(.v-btn__content) {
  white-space: normal;
}
</style>
