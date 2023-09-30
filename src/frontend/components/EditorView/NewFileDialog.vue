<template>
  <input-dialog
    title="Новое название файла"
    label="Название"
    :check-file-path="true"
    confirm-text="Создать"
    cancel-text="Отмена"
    :show="props.show"
    @confirm="(text: string) => emit('text', text)"
    @cancel="cancel"
  />
</template>

<script lang="ts" setup>
import { defineProps, withDefaults, defineEmits } from "vue";
import { useRouter } from "vue-router";
import InputDialog from "@/frontend/components/InputDialog.vue";

const props = withDefaults(defineProps<{ show: boolean }>(), { show: false });
const emit = defineEmits<{(e: "text", payload: string): void }>();

const router = useRouter();

function cancel () {
  router.back();
}
</script>
