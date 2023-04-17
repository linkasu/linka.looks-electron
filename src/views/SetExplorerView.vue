<template>
  <v-layout
    full-height
    class="root"
    :class="{ root_hide: !interfaceOutputLine }"
  >
    <output-line
      :cards="cards"
      :file="filename"
      :config="config"
      @value="(cards:Card[]) => (this.cards = cards)"
      v-if="interfaceOutputLine"
    />

    <set-grid v-if="config" :config="config" :file="filename" @card="addCard" />
  </v-layout>
</template>

<script lang="ts">
import { Vue, Options } from "vue-class-component";
import OutputLine from "@/components/OutputLine.vue";
import SetGrid from "@/components/SetGrid.vue";
import { Card, ConfigFile } from "@/interfaces/ConfigFile";
import { storageService } from "@/CardsStorage/frontend";
import { TTS } from "@/utils/TTS";
@Options({
  components: {
    OutputLine,
    SetGrid,
  },
})
export default class SetExplorerView extends Vue {
  filename: string | null = null;
  config: ConfigFile | null = null;
  cards: Card[] = [];

  get interfaceOutputLine() {
    return this.$store.getters.interface_outputLine;
  }

  mounted() {
    this.filename = this.$route.params.path.toString();

    storageService.getConfigFile(this.filename).then((config) => {
      if (config) {
        this.config = config;
        if (config.directSet != undefined) {
          this.$store.commit("interface_outputLine", !config.directSet);
        } else {
          this.$store.commit("interface_outputLine", true);
        }
      }
    });
  }
  addCard(card: Card) {
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
