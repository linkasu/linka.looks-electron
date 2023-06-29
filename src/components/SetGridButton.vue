<template>
  <eye-button>
    <div class="dot" v-if="dot">

    </div>
    <v-icon v-if="card.cardType == 3"> mdi-plus </v-icon>
    <div class="content" v-else>
      <div align-center>
        <div
          v-if="card.cardType == 0"
          class="img"
          :style="{ '--image': image }"
        />
        <h1 v-if="card.cardType == 1" class="img">⎵</h1>
      </div>
      <div v-if="card.cardType == 0" class="text">
        <span>{{ card.title?.slice(0, 50) }}</span>
      </div>
    </div>
  </eye-button>
</template>

<script lang="ts">
import { Vue, Options, prop, WithDefault } from "vue-class-component";
import EyeButton from "@/components/EyeButton.vue";
import { storageService } from "@/CardsStorage/frontend";
import { Card } from "@/interfaces/ConfigFile";

class Props {
  card: Card = prop({
    required: true,
  });
  file: string = prop({
    required: true,
  });
  dot = prop({
    default: false
  })
}
@Options({
  components: {
    EyeButton,
  },
  watch: {
    card: {
      handler: "onCard",
      deep: true,
    },
  },
})
export default class SetGridButton extends Vue.with(Props) {
  image?: string = "";


  onCard(card: Card) {
    if (card && card.imagePath) {
      if (card.cardType == 0) {
        storageService.getImage(this.file, card.imagePath).then((buffer) => {
          if (!buffer) return;
          const url = URL.createObjectURL(
            new Blob([buffer], { type: "image/png" } /* (1) */)
          );
          this.image = `url("${url}"`;
        });
      }
    }
  }

  mounted() {
    
    
    this.onCard(this.card);
  }
}
</script>

<style scoped>
.content {
  height: 100%;
  display: grid;
  grid-template-rows: auto  1em;
  gap: 10px;
  padding: 8px;
}
.icon {
  height: 100%;
  font-size: 5em;
  
}
.img {
  background-image: var(--image);
  background-position: center;
  background-repeat: no-repeat;
  height: 100%;
  width: 100%;
  background-size: contain;
}
.text {
  height: 100%;
  overflow: hidden;
  font-size: 1em;
}
.dot{
  --size: 24px;
  width: var(--size);
  height: var(--size);
  border-radius: calc(var(--size) / 2);
  background-color: rgb(var(--v-theme-secondary));
  position: absolute;
  top: calc(var(--size) / -2);
  right: calc(var(--size) / -2);
  z-index: 10000;
}
</style>
