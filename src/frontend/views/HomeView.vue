<template>
  <v-layout
    full-height
    :style="{ '--size': size }"
    class="root"
  >
    <explorer-grid-button
      v-if="!isHome"
      :back="true"
      @click="back()"
    />

    <explorer-grid-button
      v-for="file in sorted"
      :key="file.file"
      :file="file"
      @click="
        () => {
          select(file)
        }
      "
    />
  </v-layout>
</template>

<script lang="ts" setup>
import type { Ref } from "vue";
import { ref, computed, ComputedRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useStore } from "vuex";

import ExplorerGridButton from "@frontend/components/HomeView/ExplorerGridButton.vue";
import { Directory, DirectoryFile } from "@common/interfaces/Directory";
import pathModule from "path";
import { storageService } from "@frontend/CardsStorage/index";
import { Metric } from "../utils/Metric";

const store = useStore();

const router = useRouter();
const route = useRoute();

const files: Ref<Directory> = ref([]);
const mroot = ref("");
const size = ref(5);

mroot.value = route.params.path.toString();

const sorted: ComputedRef<Directory> = computed(() => {
  return files.value.map((f) => f).sort((f: DirectoryFile) => (f.directory ? -1 : 1));
});

const isHome = computed(() => {
  return mroot.value == "§";
});

const root = computed({
  get () {
    return mroot.value;
  },
  set (v: string) {
    mroot.value = v;
    router.push(v);
    loadSets();
  }
});

function back () {
  mroot.value = mroot.value.split("§").slice(0, -1).join("§");
}

function loadSets () {
  storageService.getFiles(mroot.value).then((new_files: Directory) => {
    if (!new_files) return;
    files.value = new_files;
    size.value = Math.max(Math.ceil(Math.sqrt(new_files.length + 1)), 4);
  });
}

function select (item: DirectoryFile) {
  if (item.directory) {
    mroot.value += "§" + pathModule.basename(item.file);
    Metric.registerEvent(store.state.pcHash, "openFolder", { folder: item.file });
  } else {
    router.push("/set/" + mroot.value.replace(/\//g, "§") + "§" + pathModule.basename(item.file));
  }
}
</script>

<style scoped>
.root {
  --size: 6;
  display: grid;
  grid-template-columns: repeat(var(--size), 1fr);
  grid-template-rows: repeat(var(--size), 1fr);
  height: calc(100vh - 64px);
}
</style>
