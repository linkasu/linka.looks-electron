<template>
  <eye-button>
    <div class="content">
      <div align-center>
        <v-icon
          v-if="back"
          class="icon"
          color="primary"
        >
          mdi-arrow-up
        </v-icon>
        <v-icon
          v-else-if="file && file.directory"
          class="icon"
          color="primary"
        >
          mdi-folder
        </v-icon>
        <div
          v-else
          class="img"
          :style="{ '--image': image }"
        />
      </div>
      <div>
        <span v-if="file">{{ toBasename(file.file).slice(0, 25) }}</span>
        <span v-if="back">Шаг назад</span>
      </div>
    </div>
  </eye-button>
</template>

<script lang="ts" setup>
import type { Ref } from "vue";
import { defineProps, withDefaults, ref, onMounted } from "vue";

import EyeButton from "@/frontend/components/EyeButton.vue";
import { DirectoryFile } from "@/common/interfaces/Directory";
import pathModule from "path";
import { storageService } from "@/frontend/services/card-storage-service";

const props = withDefaults(defineProps<{ file?: DirectoryFile; back: boolean }>(), { back: false });

const image: Ref<string | null> = ref("");

onMounted(() => {
  if (props.back) {
    return;
  }
  if (props.file && !props.file.directory) {
    storageService.getDefaultImage(props.file.file).then((buffer: string) => {
      if (!buffer) return;
      const url = URL.createObjectURL(new Blob([buffer], { type: "image/png" } /* (1) */));
      image.value = `url("${url}"`;
    });
  }
});

function toBasename (path: string) {
  return pathModule.basename(path);
}
</script>

<style scoped>
.content {
  height: 100%;
  display: grid;
  grid-template-rows: auto 3em;
  gap: 1em;
}
.icon {
  height: 100%;
  font-size: 5em;
}
.img {
  background-image: var(--image);
  background-position: center;
  background-repeat: no-repeat;
  height: 80%;
  width: 80%;
  margin: 10%;
  background-size: contain;
}
</style>
