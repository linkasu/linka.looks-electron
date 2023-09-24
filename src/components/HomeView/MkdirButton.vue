<template>
  <div>
    <input-dialog
      icon="mdi-folder-plus"
      title="Введите название папки"
      label="Название папки"
      confirm-text="Создать"
      cancel-text="Отмена"
      :check-file-path="true"
      @confirm="create"
    />

    <v-snackbar
      v-model="error"
      :timeout="5000"
    >
      Ошибка создания папки. Проверьте название на наличие спецсимволов.

      <template #actions>
        <v-btn
          color="blue"
          variant="text"
          @click="error = false"
        >
          Закрыть
        </v-btn>
      </template>
    </v-snackbar>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'

import InputDialog from '@frontend/components/InputDialog.vue'
import { storageService } from '@frontend/CardsStorage/index'

const route = useRoute()

const error = ref(false)

async function create(name: string) {
  const root = route.params.path.toString()
  try {
    await storageService.mkdir(root + '§' + name)
    window.location.reload()
  } catch (err) {
    error.value = true
  }
}
</script>
