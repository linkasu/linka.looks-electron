<template>
  <input-dialog
  ref="dialog"
    title="Новое название файла"
    label="Название"
    comfirmText="Создать"
    cancelText="Отмена"
    @confirm="(text:string)=>$emit('text', text)"
    @cancel="cancel"
  />
</template>

<script lang="ts">
import InputDialog from "@/components/InputDialog.vue";

import { Vue, prop, Options } from "vue-class-component";

class Props {}

@Options({
  components: {
    InputDialog,
  },
})
export default class NewFileDialog extends Vue.with(Props) {
    show(){
        (this.$refs.dialog as InputDialog).show()
    }
    cancel(){
        this.$router.back()
    }
}
</script>
