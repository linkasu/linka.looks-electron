<template>
  <input-dialog
    button-text="Создать из текста"
    title="Введите текст"
    label="Текст для картинки"
    confirm-text="Создать"
    cancel-text="Отмена"
    :disabled="ui_disabled"
    @confirm="create"
  />
  <v-snackbar v-model="showError" :timeout="6000">{{ errorMessage }}</v-snackbar>
</template>

<script lang="ts" setup>
import { computed, ref } from "vue";
import type { TextImageSize } from "@/common/textImageLayout";
import InputDialog from "@/frontend/components/InputDialog.vue";
import { storageService } from "@/frontend/services/card-storage-service";
import { useStore } from "vuex";

const store = useStore();

const props = defineProps<{ file: string; getImageSize?: () => TextImageSize | undefined }>();
const emit = defineEmits<{
  (e: "image", value: string): void;
}>();

const ui_disabled = computed(() => store.state.ui.disabled);
const showError = ref(false);
const errorMessage = ref("");

async function create(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;
  store.dispatch("disable_ui");
  try {
    const value = await storageService.createImageFromText(
      props.file,
      trimmed,
      props.getImageSize?.()
    );
    if (value) emit("image", value);
  } catch (error) {
    console.error(error);
    errorMessage.value = error instanceof Error ? error.message : "Не удалось создать картинку";
    showError.value = true;
  } finally {
    store.dispatch("enable_ui");
  }
}
</script>
