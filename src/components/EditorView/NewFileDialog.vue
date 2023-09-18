<template>
  <input-dialog
    ref="dialog"
    title="Новое название файла"
    label="Название"
    :checkFilePath="true"
    confirmText="Создать"
    cancelText="Отмена"
    @confirm="(text:string)=>$emit('text', text)"
    @cancel="cancel"
  />
</template>

<script lang="ts">
import InputDialog from "@frontend/components/InputDialog.vue";

import { Vue, prop, Options } from "vue-class-component";

class Props {}

@Options({
  components: {
    InputDialog
  }
})
export default class NewFileDialog extends Vue.with(Props) {
  show () {
    ($refs.dialog as InputDialog).show();
  }

  cancel () {
    router.back();
  }
}
</script>
