<template>
  <input-dialog
    icon="mdi-folder-plus"
    title="Введите название папки"
    label="Название папки"
    comfirmText="Создать"
    cancelText="Отмена"
    @confirm="create"
  />
</template>

<script lang="ts">
import { Vue, prop, Options } from "vue-class-component";

import InputDialog from "@/components/InputDialog.vue";
import { storageService } from "@/CardsStorage/frontend";

class Props {}

@Options({
  components: {
    InputDialog,
  },
})
export default class MkdirButton extends Vue.with(Props) {
  async create(name: string) {
    const root = this.$route.params.path.toString();
    await storageService.mkdir(root + "§" + name);
    window.location.reload()
  }
}
</script>
