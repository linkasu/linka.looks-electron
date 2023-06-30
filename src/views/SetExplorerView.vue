<template>
  <v-layout
    full-height
    class="root"
    :class="{ root_hide: !interfaceOutputLine && !isQuiz }"
  >
    <output-line
      :cards="cards"
      :file="filename"
      :config="config"
      @value="(cards:Card[] ) => (this.cards = cards)"
      v-if="interfaceOutputLine && !isQuiz"
    />
    <quiz-output-line
      :config="config"
      :page="quizPage"
      v-if="isQuiz"
      @restart="
        quizPage = 0;
        errors = 0;
      "
      :errors="errors"
    />

    <set-grid
      v-if="config"
      :config="config"
      :file="filename"
      :quizPage="quizPage"
      @card="addCard"
    />
  </v-layout>
</template>

<script lang="ts">
import { Vue, Options } from "vue-class-component";
import OutputLine from "@/components/OutputLine.vue";
import QuizOutputLine from "@/components/QuizOutputLine.vue";
import SetGrid from "@/components/SetGrid.vue";
import { Card, ConfigFile } from "@/interfaces/ConfigFile";
import { storageService } from "@/CardsStorage/frontend";
import { TTS } from "@/utils/TTS";
import { Metric } from "@/utils/Metric";
@Options({
  components: {
    OutputLine,
    SetGrid,
    QuizOutputLine,
  },
})
export default class SetExplorerView extends Vue {
  filename: string | null = null;
  get config() {
    return this.$store.state.explorer.config;
  }
  cards: Card[] = [];
  quizPage = 0;
  errors = 0;
  get interfaceOutputLine() {
    return this.$store.state.ui.outputLine;
  }
  get isQuiz() {
    return this.config?.quiz;
  }
  get quizAutoNext() {
    return this.config?.quizAutoNext;
  }
  get quizReadQuestion() {
    return this.config?.quizReadQuestion;
  }
  mounted() {
    this.filename = this.$route.params.path.toString();
    this.$store.dispatch("open_file", this.filename);
    Metric.registerEvent('openSet', {filename: this.filename})
  }
  addCard(card: Card) {
    Metric.registerEvent('cardClick', {card})
    if (this.isQuiz) {
      if (card.answer) {
        this.quizPage++;
      } else {
        this.errors++;
        if (this.quizAutoNext) {
          this.quizPage++;
        }
      }
      return;
    }
    if (this.interfaceOutputLine) {
      if (
        (this.config?.withoutSpace && card.cardType < 2) ||
        (!this.config?.withoutSpace && card.cardType == 0)
      )
        this.cards.push(card);
    } else {
      if (this.filename) TTS.instance.playCards(this.filename, [card], true);
    }
  }
}
</script>
<style scoped>
.root {
  display: grid;
  grid-template-rows: auto 8fr;
}
.root_hide {
  /* background-color: black; */
  grid-template-rows: 1fr;
}
.root > div {
  /* border: 1px solid black; */
  width: 100%;
}
</style>
