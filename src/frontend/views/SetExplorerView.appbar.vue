<template>
  <v-app-bar class="set-explorer-appbar">
    <v-btn
      flat
      icon
      @click="back"
    >
      <v-icon>mdi-arrow-left</v-icon>
    </v-btn>
    <v-app-bar-title>
      {{ title }}
    </v-app-bar-title>
    <v-spacer />
    <div
      v-if="config"
      class="page-indicator"
    >
      {{ page + 1 }} из {{ totalPages }}
    </div>
    <v-spacer />
    <notes-button
      v-if="config?.description"
      :config="config"
    />
    <v-btn
      flat
      icon
      :color="interfaceOutputLine ? 'primary' : ''"
      :title="(interfaceOutputLine ? 'Скрыть' : 'Показать') + ' строку вывода'"
      @click="switchInterfaceOutputLine"
    >
      <v-icon>mdi-form-textbox</v-icon>
    </v-btn>
    <v-btn
      flat
      icon
      :color="buttonEnabled ? 'primary' : ''"
      :title="
        (buttonEnabled ? 'Выключить' : 'Включить') + ' управление глазами'
      "
      @click="switchButtonEnabled"
    >
      <v-icon>{{ buttonEnabled ? 'mdi-eye' : 'mdi-eye-off' }}</v-icon>
    </v-btn>
    <v-spacer />
    <v-btn
      flat
      icon
      title="Настройки отображения"
      @click="toggleSettingsOpen"
    >
      <v-icon>
        mdi-view-dashboard-edit-outline
      </v-icon>
    </v-btn>
    <share-button />
    <v-btn
      flat
      icon
      :to="editLink"
    >
      <v-icon>mdi-pencil</v-icon>
    </v-btn>
    <folder-button
      :file="file"
      @move="move"
    />
    <delete-button
      :file="title"
      @delete="del"
    />
  </v-app-bar>
</template>

<script lang="ts" setup>
import { computed, onUnmounted } from "vue";
import DeleteButton from "@/frontend/components/SetExplorer/DeleteButton.vue";
import FolderButton from "@/frontend/components/SetExplorer/FolderButton.vue";
import NotesButton from "@/frontend/components/SetExplorer/NotesButton.vue";

import { useStore } from "vuex";
import { useRoute, useRouter } from "vue-router";

import { storageService } from "@/frontend/services/card-storage-service";
import ShareButton from "@/frontend/components/ShareButton.vue";
import { Metric } from "@/frontend/utils/Metric";
import pathModule from "path";
import { CardType } from "@/common/interfaces/ConfigFile";

const route = useRoute();
const router = useRouter();
const store = useStore();

const file = computed(() => route.params.path.toString());
const config = computed(() => store.state.explorer.config);
const page = computed(() => store.state.explorer.page ?? 0);

const totalPages = computed(() => {
  if (!config.value) return 1;
  const pageSize = Math.max(1, config.value.columns * config.value.rows);
  const cards = config.value.cards ?? [];
  for (let i = cards.length - 1; i >= 0; i--) {
    const card = cards[i];
    if (card && card.cardType !== CardType.NewCard) {
      const realCount = i + 1;
      return Math.max(1, Math.ceil(realCount / pageSize));
    }
  }
  return 1;
});

const title = computed(() => {
  const arr = file.value.split("§");
  return pathModule.basename(arr[arr.length - 1]);
});

const editLink = computed(() => {
  return route.fullPath.replace("set", "edit");
});

const interfaceOutputLine = computed(() => {
  return store.state.ui.outputLine;
});

const buttonEnabled = computed(() => {
  return store.state.button.enabled;
});

function switchButtonEnabled () {
  store.dispatch("button_enabled");
}

function switchInterfaceOutputLine () {
  store.dispatch("interface_outputLine");
}

function back () {
  if (file.value.includes(":")) {
    router.push("/");
    return;
  }
  router.push("/" + file.value.split("§").slice(0, -1).join("§"));
}

const isSettingsOpened = computed(() => {
  return store.state.layoutSettings.isOpened;
});

async function toggleSettingsOpen () {
  if (isSettingsOpened.value) {
    await save();
  }
  store.dispatch("toggle_settings_opened");
}

async function save () {
  await store.dispatch("editor_save");
}

async function del () {
  await storageService.moveToTrash(file.value);
  back();
  Metric.registerEvent(store.state.pcHash, "trash");
}

async function move (location: string) {
  const target = await storageService.moveSet(file.value, location);
  const url = target
    .slice(target.lastIndexOf("LINKa") + 5)
    .replaceAll("/", "§")
    .replace("\\", "§");

  router.push("/set/" + url);
  Metric.registerEvent(store.state.pcHash, "move");
}

onUnmounted(async () => {
  if (isSettingsOpened.value) {
    await toggleSettingsOpen();
  }
});
</script>

<style scoped>
.page-indicator {
  padding: 2px 10px;
  border: 1px solid black;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.9);
  font-weight: 600;
  white-space: nowrap;
}
</style>
