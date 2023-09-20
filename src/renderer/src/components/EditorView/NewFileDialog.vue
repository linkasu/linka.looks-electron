<template>
  <input-dialog
    title="Новое название файла"
    label="Название"
    :checkFilePath="true"
    confirmText="Создать"
    cancelText="Отмена"
    :show="props.show"
    @confirm="(text:string)=>emit('text', text)"
    @cancel="cancel"
  />
</template>

<script lang="ts" setup>
import { defineProps, withDefaults } from "vue";
import { useRouter } from "vue-router";
import InputDialog from "@frontend/components/InputDialog.vue";

const props = withDefaults(defineProps<{ show: boolean }>(), { show: false })

const router = useRouter();

function cancel () {
  router.back();
}
</script>
