<template>
    <eye-button>
      <div class="dot" v-if="dot">
  
      </div>
      <v-icon v-if="card.cardType == 3"> mdi-plus </v-icon>
      <div class="content" v-else>
        <div class="cardContainer" align-center>
          <canvas
            v-if="card.cardType == 0 && this.cardHasGIF(card)"
            :class="animation ? 'canvas img_hidden' : 'canvas'"
            ref="canvasRef"
          ></canvas>
          <div
            v-if="card.cardType == 0"
            :class="animation || !this.cardHasGIF(card) ? 'img' : 'img img_hidden'"
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
    required: true
  });

  file: string = prop({
    required: true
  });

  dot = prop({
    default: false
  });
}
@Options({
  components: {
    EyeButton
  },
  watch: {
    card: {
      handler: "onCard",
      deep: true
    }
  }
})
export default class SetGridButton extends Vue.with(Props) {
  image?: string = "";

  onCard (card: Card) {
    if (card && card.imagePath) {
      if (card.cardType == 0) {
        storageService.getImage(this.file, card.imagePath).then((buffer) => {
          if (!buffer) return;
          const url = URL.createObjectURL(
            new Blob([buffer], { type: "image/png" } /* (1) */)
          );
          this.image = `url("${url}")`;
          if (this.cardHasGIF(card)) {
            this.createStaticImage(url);
          }
        });
      }
    }
  }

  cardHasGIF(card: Card): boolean {
    if (card && card.imagePath) {
      return card.imagePath.includes("gif");
    }
      return false;
  }

  createStaticImage(url: string) {
    const canvas = this.$refs.canvasRef as HTMLCanvasElement;
    let img = new Image();
    img.src = url;
    img.onload = function () {
      const ratio = img.naturalWidth / img.naturalHeight;
      const newHeight = canvas.height;
      const newWidth = newHeight * ratio;
      const xOffset = (canvas.width - newWidth) / 2;
      const ctx = canvas.getContext("2d");
      // @ts-ignore
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // @ts-ignore
      ctx.drawImage(img, xOffset, 0, newWidth, newHeight);
    };
  }

  mounted() {
    this.onCard(this.card);
  }

  get animation() {
    return this.$store.state.button.animation;
  }
}
</script>

<style scoped>
.content {
  height: 100%;
  display: grid;
  grid-template-rows: auto 1.5em;
  gap: 10px;
  padding: 8px;
}
.icon {
  height: 100%;
  font-size: 5em;
}
.cardContainer {
  position: relative;
}
.img {
  background-image: var(--image);
  background-position: center;
  background-repeat: no-repeat;
  height: 100%;
  width: 100%;
  background-size: contain;
}
.img_hidden {
    display: none;
  }
.canvas {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  height: 100%;
}
.text {
  height: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  font-size: 1em;
}
.dot {
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
