<template>
  <v-layout full-height class="root">
    <output-line :cards="cards" :file="filename" :config="config" @value="(cards)=>this.cards=cards" />
    <set-grid v-if="config" :config="config" :file="filename"  @card="addCard"/>
  </v-layout>
</template>

<script lang="ts">
import { Vue, Options } from "vue-class-component";
import OutputLine from "@/components/OutputLine.vue";
import SetGrid from "@/components/SetGrid.vue";
import { Card, ConfigFile } from "@/interfaces/ConfigFile";
import { storageService } from "@/CardsStorage/frontend";
@Options({
  components: {
    OutputLine,
    SetGrid,
  },
})
export default class SetExplorerView extends Vue {
  filename: string| null = null;;
  config: ConfigFile| null = null;
  cards: Card[] = []
  mounted() {
    this.filename = this.$route.params.path.toString().replace(/§/g, "/");

    storageService.getConfigFile(this.filename).then((config) => {

      if (config) this.config = config;
    });
  }
  addCard(card:Card){
    this.cards.push(card)
  }
}
</script>
<style scoped>
.root {
  display: grid;
  grid-template-rows: auto 8fr;
}
.root > div {
  /* border: 1px solid black; */
  width: 100%;
}
</style>
