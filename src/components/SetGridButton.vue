<template>
  <eye-button>
    <div class="dot" v-if="dot">

    </div>
    <v-icon v-if="card.cardType == 3"> mdi-plus </v-icon>
    <div class="content" v-else>
      <div class="cardContainer" align-center>
        <canvas :id="card.imagePath" 
        v-if="card.cardType == 0 && card && card.imagePath && this.isImageGIF(card.imagePath)"
        :class="animationEnabled?'canvas img_hidden':'canvas'"
        ></canvas>
        <div
          v-if="card.cardType == 0"
          :class="animationEnabled || !this.isImageGIF(card.imagePath)?'img':'img img_hidden'"
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
import { ref } from 'vue';

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
  cardImageRef = ref(null);

  onCard(card: Card) {
    if (card && card.imagePath) {
      const path = card.imagePath;
      console.log(path)
      if (card.cardType == 0) {
        storageService.getImage(this.file, path).then((buffer) => {
          if (!buffer) return;
          const url = URL.createObjectURL(
            new Blob([buffer], { type: "image/png" } /* (1) */)
          );
          console.log(url)
          this.image = `url("${url}"`;
          if (this.isImageGIF(path)) {
            const canvas = this.getCanvasByImagePath(path);
            if(canvas) {
              this.createStaticImage(url, canvas);
            }
          }
        });
      }
    }
  }

  mounted() {
    this.onCard(this.card);
  }

  isImageGIF(path: string) {
    return path.includes('gif')
  }

  needToShowStatic() {
    return !!this.card && !!this.card.imagePath && this.isImageGIF(this.card.imagePath) && !this.animationEnabled
  }

  get animationEnabled() {
    return this.$store.state.animation.enabled;
  }

  getCanvasByImagePath(path: string): HTMLCanvasElement | undefined {
    return document.getElementById(path) as HTMLCanvasElement;
  }

  createStaticImage(url:string, canvas: HTMLCanvasElement) {
    var img = new Image();
    let fullImage = new Image();
    img.onload = function(event) {
      fullImage.src = url;
      const width = fullImage.naturalWidth;
      const height = fullImage.naturalHeight;
      const ratio = width / height;
      const newWidth = canvas.height*ratio;
      const xOffset = (canvas.width-newWidth)/2;
      // @ts-ignore
      canvas.getContext('2d').drawImage(img, xOffset, 0, newWidth, canvas.height);
    };
    img.src = url;
  }
}
</script>

<style scoped>
.content {
  height: 100%;
  display: grid;
  grid-template-rows: auto  1.5em;
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
.canvas {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  height: 100%;
}
.img_hidden {
  display: none;
}
.text {
  height: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
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
