<template>
  <v-dialog v-model="dialog" width="auto">
    <template v-slot:activator="{ props }">
      <v-btn v-bind="props" block> Cоздать из текста </v-btn>
    </template>

    <v-card min-width="300px">
      <v-card-title primary-title> Введите текст </v-card-title>
      <v-card-text>
        <v-form>
          <v-select
            :items="voices"
            v-model="voice"
            label="Голос"
            item-value="value"
            item-title="text"
          ></v-select>

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

        <v-spacer></v-spacer>
        <v-btn color="success" @click="playExample">Послушать результат</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
import { storageService } from "@/CardsStorage/frontend";
import { TTS } from "@/utils/TTS";
import { Vue, prop, Options } from "vue-class-component";

class Props {
  file: string = prop({
    required: true
  });
}

@Options({
  watch: {
    dialog: "onDialog"
  }
})
export default class TTSDialog extends Vue.with(Props) {
  dialog = false;
  text = "";
  voice = "alena";
  voices = [
    { value: "zahar", text: "Захар" },
    { value: "ermil", text: "Емиль" },
    { value: "jane", text: "Джейн" },
    { value: "oksana", text: "Оксана" },
    { value: "alena", text: "Алёна" },
    { value: "filipp", text: "Филипп" },
    { value: "omazh", text: "Ома" }

  ];

  create () {
    storageService.createAudioFromText(this.file, this.text, this.voice).then((value) => {
      this.$emit("audio", value);
    });
  }

  onDialog (v: boolean) {
    if (!v) {
      this.text = "";
    }
  }

  playExample () {
    TTS.instance.playText(this.text, this.voice);
  }
}
</script>
