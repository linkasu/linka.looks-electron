<template>
  <div class="grid">
    <eye-button @click="page--">
      <v-icon> mdi-arrow-left </v-icon>
    </eye-button>

    <div
      class="cards"
      :style="{ '--rows': config.rows, '--columns': config.columns }"
    >
      <set-grid-button v-for="card in current" :key="card.id" :card="card" :file="file" @click="$emit('card', card)" />
    </div>

    <eye-button @click="page++">
      <v-icon> mdi-arrow-right </v-icon>
    </eye-button>
  </div>
</template>

<script lang="ts">
import { ConfigFile } from "@/interfaces/ConfigFile";
import { Vue, Options, prop } from "vue-class-component";
import EyeButton from "@/components/EyeButton.vue";
import SetGridButton from "@/components/SetGridButton.vue";

class Props {
  config: ConfigFile = prop({
    required: true,
  });
  file: string = prop({
    required: true
  })
}

@Options({
  components: {
    EyeButton,
    SetGridButton,
  },
})
export default class SetGrid extends Vue.with(Props) {
  private mpage = 0;
  public get page() {
    return this.mpage;
  }
  public set page(value) {
    this.mpage = Math.max(
      0,
      Math.min(Math.ceil(this.config.cards.length / this.pageSize)-1, value)
    );
  }

  get current() {
    return this.config.cards.slice(
      this.pageSize * this.page,
      this.pageSize * (this.page + 1)
    );
  }

  public get pageSize(): number {
    return this.config.columns * this.config.rows;
  }

  mounted() {
    if (!this.config) return;
    
  }
}
</script>

<style scoped>
.grid {
  border-top: 1px solid black;
  display: grid;

  grid-template-columns: 1fr 8fr 1fr;
  height: 100%;
}

.cards {
  display: grid;
  grid-template-columns: repeat(var(--columns), 1fr);
  grid-template-rows: repeat(var(--rows), 1fr);
}
</style>
