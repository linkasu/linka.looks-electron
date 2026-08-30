<template>
  <eye-button>
    <div class="content">
      <div align-center>
        <v-icon v-if="back" class="icon" color="primary"> mdi-arrow-up </v-icon>
        <v-icon v-else-if="file && file.directory" class="icon" color="primary">
          mdi-folder
        </v-icon>
        <div v-else class="img" :style="{ '--image': image }" />
      </div>
      <div class="label" :title="displayName">
        <span>{{ displayName }}</span>
      </div>
    </div>
  </eye-button>
</template>

<script lang="ts" setup>
import type { Ref } from "vue";
import { computed, ref, onMounted } from "vue";

import EyeButton from "@/frontend/components/EyeButton.vue";
import { DirectoryFile } from "@/common/interfaces/Directory";
import { storageService } from "@/frontend/services/card-storage-service";

const props = withDefaults(defineProps<{ file?: DirectoryFile; back?: boolean }>(), {
  back: false
});

const image: Ref<string | null> = ref("");

const displayName = computed(() => {
  if (props.back) return "Шаг назад";
  if (!props.file) return "";

  const name = toBasename(props.file.file);
  if (!props.file.directory && name.toLowerCase().endsWith(".linka")) {
    return name.slice(0, -".linka".length);
  }

  return name;
});

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

function toBasename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}
</script>

<style scoped>
.content {
  height: 100%;
  display: grid;
  grid-template-rows: minmax(0, 1fr) 3.5em;
  gap: 0.5em;
  padding: 0.5em;
}
.icon {
  height: 100%;
  font-size: 5em;
}
.label {
  align-items: center;
  display: flex;
  font-size: 1.1em;
  font-weight: 600;
  justify-content: center;
  line-height: 1.15;
  overflow: hidden;
  text-align: center;
  word-break: break-word;
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
