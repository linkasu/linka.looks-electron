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
</template>

<script lang="ts" setup>
import { computed } from "vue";
import InputDialog from "@/frontend/components/InputDialog.vue";
import { storageService } from "@/frontend/services/card-storage-service";
import { useStore } from "vuex";

const store = useStore();

const props = defineProps<{ file: string }>();
const emit = defineEmits<{
  (e: "image", value: string): void;
}>();

const ui_disabled = computed(() => store.state.ui.disabled);

async function create(text: string) {
  store.dispatch("disable_ui");
  try {
    const value = await storageService.createImageFromText(props.file, text);
    if (value) emit("image", value);
  } catch (error) {
    console.error(error);
  } finally {
    store.dispatch("enable_ui");
  }
}
</script>
