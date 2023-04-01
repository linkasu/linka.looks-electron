<template>
  <v-dialog v-model="dialog" width="auto">
    <template v-slot:activator="{ props }">
      <v-btn v-bind="props" block> Cоздать из текста </v-btn>
    </template>

    <v-card min-width="300px">
      <v-card-title primary-title> Введите текст </v-card-title>
      <v-card-text>
        <v-form>
          <v-text-field
            label="Текст для картинки"
            v-model="text"
          ></v-text-field>
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-btn
          color="primary"
          @click="
            create();
            dialog = false;
          "
        >
          Создать
        </v-btn>
        <v-btn color="primary" @click="dialog = false"> Отмена </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
import { storageService } from "@/CardsStorage/frontend";
import { Vue, prop, Options } from "vue-class-component";

class Props {
  file: string = prop({
    required: true,
  });
}

@Options({})
export default class CreateFromTextDialog extends Vue.with(Props) {
  dialog = false;
  text = "";
  create() {
    storageService.createImageFromText(this.file, this.text).then((value) => {
      this.$emit("image", value);
    });
  }
}
</script>
