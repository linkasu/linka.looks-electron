<template>
  <input-dialog
    buttonText="Cоздать из текста"
    title="Введите текст"
    label="Текст для картинки"
    comfirmText="Создать"
    cancelText="Отмена"
    @confirm="create"
  />
</template>

<script lang="ts">
import InputDialog from "@/components/InputDialog.vue";

import { storageService } from "@/CardsStorage/frontend";
import { Vue, prop, Options } from "vue-class-component";

class Props {
  file: string = prop({
    required: true,
  });
}

@Options({
  components: {
    InputDialog,
  },
})
export default class CreateFromTextDialog extends Vue.with(Props) {
  create(text: string) {
    storageService.createImageFromText(this.file, text).then((value) => {
      this.$emit("image", value);
    });
  }
}
</script>
