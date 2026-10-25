<template>
  <v-btn flat icon="" data-testid="editor-exit-btn" @click="handleClick">
    <v-icon>mdi-arrow-left</v-icon>
  </v-btn>
  <v-dialog v-model="dialog" width="auto">
    <v-card min-width="300px">
      <v-card-title primary-title> Выйти без сохранения? </v-card-title>
      <v-card-text> Вы уверены? </v-card-text>
      <v-card-actions>
        <v-btn
          color="error"
          data-testid="editor-exit-confirm"
          @click="(emit('exit'), (dialog = false))"
        >
          Да
        </v-btn>
        <v-btn color="primary" data-testid="editor-exit-cancel" @click="dialog = false">
          Нет
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { ref } from "vue";

const props = withDefaults(
  defineProps<{
    confirm?: boolean;
  }>(),
  {
    confirm: true
  }
);

const dialog = ref(false);

const emit = defineEmits<{ (e: "exit"): void }>();

function handleClick() {
  if (!props.confirm) {
    emit("exit");
    return;
  }
  dialog.value = true;
}
</script>
