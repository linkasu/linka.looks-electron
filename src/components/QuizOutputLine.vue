<template>
  <v-layout full-height class="output-line">
    <h1 v-if="config.questions && page != undefined && !end">
      {{ question }}
    </h1>
    <v-layout row justify-center>
      <v-dialog v-model="endDialog" width="600px">
        <v-card>
          <v-card-title>
            <span class="headline">Опрос окончен</span>
          </v-card-title>
          <v-card-text> Хотите начать сначала? </v-card-text>
          <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn
              color="green darken-1"
              @click="
                $emit('restart');
                endDialog = false;
              "
            >
              Да
            </v-btn>
            <v-btn color="green darken-1" @click="endDialog = false">
              Нет</v-btn
            >
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-layout>
  </v-layout>
</template>

<script lang="ts">
import { ConfigFile } from "@/interfaces/ConfigFile";
import { TTS } from "@/utils/TTS";
import { updateFor } from "typescript";
import { Vue, prop, Options } from "vue-class-component";

class Props {
  config = prop<ConfigFile>({
    required: true,
  });
  page = prop<number>({
    required: true,
  });
}

@Options({})
export default class QuizOutputLine extends Vue.with(Props) {
  startDialog = false;
  endDialog = false;
  get question() {
    if (!this.config.questions) return "";
    const text = this.config.questions[this.page];
    TTS.instance.playText(text)
    return text
  }
  get end() {
    if (!this.config.questions) return false;
    const isEnd = this.page >= this.config.questions.length;
    this.endDialog = isEnd;
    return isEnd;
  }
}
</script>

<style scope>
.output-line {
  height: 150px;
  display: grid;
  grid-template-columns: 1fr 8fr 1fr;
}
h1 {
  grid-column: 2;
  height: 90%;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
