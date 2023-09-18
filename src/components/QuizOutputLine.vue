<template>
  <v-layout>
    <v-layout full-height class="output-line" v-if="!end">
      <h1>
        <v-icon>mdi-head-question</v-icon>
      </h1>

      <h1>
        <v-icon color="error" :icon="`mdi-numeric-${errors}-box`" />
      </h1>
      <h1 v-if="config.questions && page != undefined && !end">
        {{ question }}
      </h1>
      <h1>
        <v-icon color="green" :icon="`mdi-numeric-${page + 1}-box`" />/<v-icon
          color="primary"
          :icon="`mdi-numeric-${config.questions?.length}-box`"
        />
      </h1>
    </v-layout>
    <v-layout row justify-center style="position: absolute">
      <v-dialog v-model="endDialog">
        <v-card>
          <v-card-title>
            <span class="headline">Опрос окончен</span>
          </v-card-title>
          <v-card-text> Количество ошибок: {{ errors }} </v-card-text>
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
      <v-dialog v-model="startDialog">
        <v-card>
          <v-card-title>
            <span class="headline">Этот набор викторина!</span>
          </v-card-title>
          <v-card-text>
            Вам будут предложены вопросы, выбирайте ответы
          </v-card-text>
          <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn
              color="green darken-1"
              @click="
                  startDialog = false;

              "
            >
              Начать
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-layout>
  </v-layout>
</template>

<script lang="ts">
import { ConfigFile } from "@common/interfaces/ConfigFile";
import { TTS } from "@electron/utils/TTS";
import { updateFor } from "typescript";
import { Vue, prop, Options } from "vue-class-component";

class Props {
  config = prop<ConfigFile>({
    required: true
  });

  page = prop<number>({
    required: true
  });

  errors = prop<number>({
    required: true
  });
}

@Options({})
export default class QuizOutputLine extends Vue.with(Props) {
  startDialog = true;
  endDialog = false;
  get question () {
    const text = readQuestion();
    return text;
  }

  readQuestion () {
    if (!config.questions) return "";
    const text = config.questions[page];

    if (config.quizReadQuestion && !startDialog) {
      TTS.instance.playText(text)
        .catch(console.error);
    }
    return text;
  }

  get end () {
    if (!config.questions) return false;
    const isEnd = page >= config.questions.length;
    endDialog = isEnd;
    return isEnd;
  }
}
</script>

<style scope>
.output-line {
  height: 150px;
  display: grid;
  grid-template-columns: 1fr 1fr 6fr 2fr;
}
h1 {
  height: 90%;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
