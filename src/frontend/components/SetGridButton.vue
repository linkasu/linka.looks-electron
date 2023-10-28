<template>
  <eye-button>
    <div
      v-if="dot"
      class="dot"
    />
    <v-icon v-if="card.cardType == 3">
      mdi-plus
    </v-icon>
    <div
      v-else
      class="content"
    >
      <div
        class="cardContainer"
        align-center
      >
        <canvas
          v-if="card.cardType == 0 && cardHasGIF(card)"
          ref="canvasRef"
          :class="animation ? 'canvas img_hidden' : 'canvas'"
        />
        <div
          ref="clearfixRef"
          class="canvasClearfix"
        />
        <div
          v-if="card.cardType == 0"
          :class="animation || !cardHasGIF(card) ? 'img' : 'img img_hidden'"
          :style="{ '--image': image }"
        />
        <h1
          v-if="card.cardType == 1"
          class="img"
        >
          ⎵
        </h1>
      </div>
      <div
        v-if="card.cardType == 0"
        class="text"
      >
        <span>{{ card.title?.slice(0, 50) }}</span>
      </div>
    </div>
  </eye-button>
</template>

<script lang="ts" setup>
import type { Ref } from "vue";
import { defineProps, withDefaults, ref, computed, watch, onMounted } from "vue";
import { useStore } from "vuex";

import EyeButton from "@/frontend/components/EyeButton.vue";
import type { Card } from "@/common/interfaces/ConfigFile";
import { storageService } from "@/frontend/services/card-storage-service";

interface ISetGridButtonProps {
  card: Card
  file: string
  dot?: boolean
}

const props = withDefaults(defineProps<ISetGridButtonProps>(), {
  dot: false,
});

const store = useStore();
const image: Ref<string | null> = ref("");

const canvasRef: Ref<Element | null> = ref(null);
const clearfixRef: Ref<Element | null> = ref(null);

onMounted(() => {
  onCard(props.card);
});

watch(() => props.card, onCard, { deep: true });

const animation = computed(() => {
  return store.state.button.animation;
});

function onCard (card: Card) {
  if (card && card.imagePath) {
    if (card.cardType === 0) {
      storageService.getImage(props.file, card.imagePath).then((buffer: ArrayBuffer) => {
        if (!buffer) return;
        const url = URL.createObjectURL(new Blob([buffer], { type: "image/png" } /* (1) */));
        image.value = `url("${url}")`;
        if (cardHasGIF(card)) {
          createStaticImage(url);
        }
      });
    }
  }
}

function cardHasGIF (card: Card): boolean {
  if (card && card.imagePath) {
    return card.imagePath.includes("gif");
  }
  return false;
}

function createStaticImage (url: string) {
  const canvas = canvasRef.value as HTMLCanvasElement;
  const clearfixContainer = clearfixRef.value as HTMLCanvasElement;
  const containerWidth = clearfixContainer.offsetWidth;
  const containerHeight = clearfixContainer.offsetHeight;
  canvas.height = containerHeight;
  canvas.width = containerWidth;
  const img = new Image();
  img.src = url;
  img.onload = function () {
    const ratio = img.naturalWidth / img.naturalHeight;
    const newWidth = containerHeight * ratio;

    const finalWidth = newWidth > containerWidth ? containerWidth : newWidth;
    const finalHeight = finalWidth / ratio;

    const xOffset = (canvas.width - finalWidth) / 2;
    const yOffset = (canvas.height - finalHeight) / 2;

    const ctx = canvas.getContext("2d");

    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    ctx?.drawImage(img, xOffset, yOffset, finalWidth, finalHeight);
  };
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
.canvasClearfix {
  position: absolute;
  left: 50%;
  top: 50%;
  height: 100%;
  width: 100%;
  transform: translate(-50%, -50%);
}
.canvas {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
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
