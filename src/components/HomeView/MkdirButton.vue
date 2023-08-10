<template>
  <div>
    <input-dialog
      icon="mdi-folder-plus"
      title="Введите название папки"
      label="Название папки"
      comfirmText="Создать"
      cancelText="Отмена"
      @confirm="create"
      :checkFilePath="true"
    />

    <v-snackbar v-model="error" :timeout="5000">
      Ошибка создания папки. Проверьте название на наличие спецсимволов.

      <template v-slot:actions>
        <v-btn color="blue" variant="text" @click="error = false">
          Закрыть
        </v-btn>
      </template>
    </v-snackbar>
  </div>
</template>

<script lang="ts">
import { Vue, prop, Options } from "vue-class-component";

import InputDialog from "@/components/InputDialog.vue";
import { storageService } from "@/CardsStorage/frontend";

class Props {}

@Options({
  components: {
    InputDialog
  }
})
export default class MkdirButton extends Vue.with(Props) {
  error = false;

  async create (name: string) {
    const root = this.$route.params.path.toString();
    try {
      await storageService.mkdir(root + "§" + name);
      window.location.reload();
    } catch (error) {
      this.error = true;
    }
  }
}
</script>
