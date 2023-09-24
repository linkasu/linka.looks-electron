<template>
  <input-dialog
    button-text="Создать из текста"
    title="Введите текст"
    label="Текст для картинки"
    confirm-text="Создать"
    cancel-text="Отмена"
    @confirm="create"
  />
</template>

<script lang="ts" setup>
// @ts-ignore  
import { defineProps, defineEmits } from 'vue'
import InputDialog from '@frontend/components/InputDialog.vue'
// @ts-ignore  
import { storageService } from '@frontend/CardsStorage/index'

const props = defineProps<{ file: string }>()
const emit = defineEmits<{
  (e: 'image', value: string): void
}>()

function create(text: string) {
  storageService.createImageFromText(props.file, text).then((value: string) => {
    emit('image', value)
  })
}
</script>
