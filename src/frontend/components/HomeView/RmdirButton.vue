<template>
  <v-dialog v-model="dialog" max-width="520">
    <template #activator="{ props }">
      <v-btn
        flat
        :icon="!text"
        :block="!!text"
        :prepend-icon="text ? 'mdi-folder-remove' : undefined"
        v-bind="props"
        title="Удалить папку"
        aria-label="Удалить папку"
      >
        <v-icon v-if="!text">mdi-folder-remove</v-icon>
        {{ text }}
      </v-btn>
    </template>

    <v-card>
      <v-card-title primary-title> Какую папку вы хотите удалить? </v-card-title>
      <v-card-text>
        <v-select v-if="directories" v-model="directory" :items="titles" label="Папка" />
        <p>Папка со всем содержимым будет удалена безвозвратно, без перемещения в корзину.</p>
      </v-card-text>
      <v-card-actions>
        <v-btn
          color="error"
          variant="flat"
          :disabled="!directory"
          @click="(remove(), (dialog = false))"
        >
          Удалить папку
        </v-btn>
        <v-btn @click="dialog = false"> Отмена </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import type { Ref } from "vue";
import { ref, computed, watch } from "vue";

import { useRoute } from "vue-router";

import { storageService } from "@/frontend/services/card-storage-service";
import { DirectoryFile } from "@/common/interfaces/Directory";

const route = useRoute();
defineProps<{ text?: string }>();

const dialog = ref(false);
const directories: Ref<DirectoryFile[] | null> = ref(null);
const directory: Ref<string | null> = ref(null);

const titles = computed(() => {
  return directories.value?.map(({ file }) => {
    return file.split("/").slice(-1)[0];
  });
});
const root = computed(() => {
  return route.params.path.toString();
});

watch(dialog, onDialog);

function onDialog(value: boolean) {
  if (value) {
    load();
  }
}

async function load() {
  directories.value = (await storageService.getFiles(root.value))?.filter(
    ({ directory }: DirectoryFile) => directory
  );
  if (titles.value) directory.value = titles.value[0];
}

async function remove() {
  await storageService.rmdir(root.value + "§" + directory.value);
  setTimeout(() => {
    window.location.reload();
  }, 100);
}
</script>
