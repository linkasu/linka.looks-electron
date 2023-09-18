<template>
  <div class="grid">
    <div class="left-grid">
      <eye-button color="accent" @click="$router.back()" v-if="isExitButton">
      <v-icon>mdi-exit-run</v-icon>
    </eye-button>
    <eye-button @click="page--" color="primary" v-if="!config.quiz">
      <v-icon> mdi-arrow-left </v-icon>
    </eye-button>
  </div>

    <div
      class="cards"
      :style="{ '--rows': config.rows, '--columns': config.columns }"
    >
      <set-grid-button v-for="card in current" :key="card.id" :card="card" :file="file" @click="$emit('card', card)" />
    </div>

    <eye-button @click="page++" color="primary" v-if="!config.quiz">
      <v-icon> mdi-arrow-right </v-icon>
    </eye-button>
  </div>
</template>

<script lang="ts">
import { ConfigFile } from "@common/interfaces/ConfigFile";
import { Vue, Options, prop } from "vue-class-component";
import EyeButton from "@frontend/components/EyeButton.vue";
import SetGridButton from "@frontend/components/SetGridButton.vue";

class Props {
  config: ConfigFile = prop({
    required: true
  });

  file: string = prop({
    required: true
  });

  quizPage?:number = prop({
    required: false
  });
}

@Options({
  components: {
    EyeButton,
    SetGridButton
  },
  watch: {
    quizPage: "onQuizPage"
  }
})
export default class SetGrid extends Vue.with(Props) {
  private mpage = 0;
  public get page () {
    return mpage;
  }

  public set page (value) {
    mpage = Math.max(
      0,
      Math.min(Math.ceil(config.cards.length / pageSize) - 1, value)
    );
  }

  get current () {
    return config.cards.slice(
      pageSize * page,
      pageSize * (page + 1)
    );
  }

  public get pageSize (): number {
    return config.columns * config.rows;
  }

  get isExitButton () {
    return store.state.ui.exitButton && !store.state.ui.outputLine;
  }

  onQuizPage (p:number) {
    page = p;
  }
}
</script>

<style scoped>

.grid {
  border-top: 1px solid black;
  display: grid;

  grid-template-columns: 1fr 16fr 1fr;
  height: 100%;
}

.cards {
  display: grid;
  grid-template-columns: repeat(var(--columns), 1fr);
  grid-template-rows: repeat(var(--rows), calc(100% / var(--rows)));
}

.left-grid{
  display: grid;
  grid-template-columns: 1fr;
}
.left-grid:has(button+button){
  grid-template-rows: 2fr 10fr;
}
</style>
