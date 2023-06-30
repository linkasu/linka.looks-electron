<template>
  <v-layout
    full-height
    class="output-line"
    :class="{ 'output-line-back': isExitButton }"
  >
    <eye-button color="accent" @click="$router.back()" v-if="isExitButton">
      <v-icon>mdi-exit-run</v-icon>
    </eye-button>
    <eye-button
      :lock="true"
      :color="buttonEnabled ? 'accent' : ''"
      @click="switchButtonEnabled"
    >
      <v-icon>{{ buttonEnabled ? "mdi-eye" : "mdi-eye-off" }}</v-icon>
    </eye-button>
    <eye-button class="output-block" @click="say">
      <v-icon block class="speaker-icon" :color="isPlaying ? 'success' : ''">
        mdi-account-voice
      </v-icon>
      <div class="output-text" ref="text">
        <div class="text" v-if="withoutSpace">{{ text }}<span class="cursor">|</span></div>
        <div v-else class="cards">
          <set-grid-button
            v-for="(card, i) in clone"
            :enabled="false"
            :key="i"
            :card="card"
            :file="file"
            class="card"
          />
        </div>
      </div>
    </eye-button>
    <eye-button @click="backspace" color="accent">
      <v-icon> mdi-backspace </v-icon>
    </eye-button>
    <eye-button @click="clear" color="accent">
      <v-icon> mdi-delete </v-icon>
    </eye-button>
  </v-layout>
</template>

<script lang="ts">
import { Vue, Options, prop } from "vue-class-component";
import EyeButton from "@/components/EyeButton.vue";
import SetGridButton from "@/components/SetGridButton.vue";
import { Card, ConfigFile } from "@/interfaces/ConfigFile";
import { TTS } from "@/utils/TTS";

class Props {
  file: string = prop({
    required: true,
  });
  cards: Card[] = prop({
    required: true,
  });
  config: ConfigFile = prop({
    required: true,
  });
}
@Options({
  components: {
    EyeButton,
    SetGridButton,
  },
})
export default class OutpuiLine extends Vue.with(Props) {
  get isExitButton() {
    return this.$store.state.ui.exitButton;
  }

  get buttonEnabled() {
    return this.$store.state.button.enabled;
  }
  switchButtonEnabled() {
    this.$store.dispatch("button_enabled");
  }

  get withoutSpace() {
    return this.config?.withoutSpace;
  }
  get text() {
    return this.clone
      .map((c) => {
        return c.cardType == 0 ? c.title : " ";
      })
      .join("");
  }
  get clone() {
    this.scrollEnd();

    return [...this.cards];
  }
  scrollEnd() {
    setTimeout(() => {
      const el = this.$refs.text as HTMLButtonElement;
      if (el && el.firstElementChild)
        el.scrollTo({
          left: el.firstElementChild.scrollWidth + 100,
        });
    }, 50);
  }

  clear() {
    this.$emit("value", []);
  }

  backspace() {
    this.$emit("value", this.clone.slice(0, -1));
  }
  async say() {
    this.isPlaying = true;
    if (this.config.withoutSpace) await TTS.instance.playText(this.text);
    else await TTS.instance.playCards(this.file, this.cards);
    this.isPlaying = false;
  }
  isPlaying = false;
}
</script>

<style scoped>
.eye-button {
  /* background-color: #; */
}
.output-line {
  height: 150px;
  display: grid;
  grid-template-columns: 1fr 7fr 1fr 1fr;
}
.output-line-back {
  grid-template-columns: 1fr 1fr 6fr 1fr 1fr;
}

.text {
  margin-top: 22.5px;
  font-size: 60px;
  vertical-align: middle;
  text-align: left;
}
.output-text {
  display: block;
  width: 100%;
  height: 100%;
  overflow-x: scroll;
}

.output-block {
  display: grid;
  grid-template-columns: 1fr 6fr;
  overflow: hidden;
}
.speaker-icon {
  width: 100%;
  height: 100%;
}

.cards {
  height: 100%;
  display: inline-flex;
  max-width: max-content;
}
.card {
  box-shadow: none;
  height: 100%;
  width: 150px;
}

.cursor{
  animation: blink 1s linear ;
  animation-iteration-count: infinite;
  animation-timing-function:step-start;
}
@keyframes blink {
  0%{
    color: #000;
  }
  50%{
    color: rgba(255, 255, 255, 0);
  }
  100%{
    color: #000;
  }
}

</style>
