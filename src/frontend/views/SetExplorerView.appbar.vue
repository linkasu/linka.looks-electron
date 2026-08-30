<template>
  <v-app-bar class="set-explorer-appbar">
    <v-btn flat icon @click="back">
      <v-icon>mdi-arrow-left</v-icon>
    </v-btn>
    <v-app-bar-title>
      {{ title }}
    </v-app-bar-title>
    <v-spacer />
    <div v-if="config" class="page-indicator">{{ page + 1 }} из {{ totalPages }}</div>
    <v-spacer />
    <notes-button v-if="config?.description" :config="config" />
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
      :title="(buttonEnabled ? 'Выключить' : 'Включить') + ' управление глазами'"
      @click="switchButtonEnabled"
    >
      <v-icon>{{ buttonEnabled ? "mdi-eye" : "mdi-eye-off" }}</v-icon>
    </v-btn>
    <v-spacer />
    <v-btn flat icon title="Настройки отображения" @click="toggleSettingsOpen">
      <v-icon> mdi-view-dashboard-edit-outline </v-icon>
    </v-btn>
    <share-button />
    <v-btn flat icon title="Копировать набор" @click="duplicateSet">
      <v-icon>mdi-content-copy</v-icon>
    </v-btn>
    <v-btn flat icon title="Объединить наборы" @click="startMerge">
      <v-icon>mdi-merge</v-icon>
    </v-btn>
    <v-btn flat icon :to="editLink">
      <v-icon>mdi-pencil</v-icon>
    </v-btn>
    <folder-button :file="file" @move="move" />
    <delete-button :file="title" @delete="del" />
    <v-dialog v-model="mergeDialog" width="auto">
      <v-card min-width="340px">
        <v-card-title primary-title> Объединить наборы </v-card-title>
        <v-card-text>
          <div class="merge-subtitle">Основной: {{ title }}</div>
          <v-text-field
            v-model="mergeName"
            label="Имя нового набора"
            :placeholder="mergeDefaultName"
          />
          <v-select
            v-model="mergeTarget"
            :items="mergeOptions"
            label="Второй набор"
            item-title="title"
            item-value="value"
          />
        </v-card-text>
        <v-card-actions>
          <v-btn color="primary" :disabled="!mergeTarget" @click="applyMerge"> Объединить </v-btn>
          <v-btn color="primary" @click="mergeDialog = false"> Отмена </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-app-bar>
</template>

<script lang="ts" setup>
import { computed, onUnmounted, ref } from "vue";
import DeleteButton from "@/frontend/components/SetExplorer/DeleteButton.vue";
import FolderButton from "@/frontend/components/SetExplorer/FolderButton.vue";
import NotesButton from "@/frontend/components/SetExplorer/NotesButton.vue";

import { useStore } from "vuex";
import { useRoute, useRouter } from "vue-router";

import { storageService } from "@/frontend/services/card-storage-service";
import ShareButton from "@/frontend/components/ShareButton.vue";
import { Telemetry } from "@/frontend/utils/Telemetry";
import pathModule from "path";
import { Directory } from "@/common/interfaces/Directory";
import { HOME_DIR } from "@/common/constants";

const route = useRoute();
const router = useRouter();
const store = useStore();
const mergeDialog = ref(false);
const mergeTarget = ref("");
const mergeName = ref("");
const mergeOptions = ref<{ title: string; value: string }[]>([]);

const file = computed(() => route.params.path.toString());
const config = computed(() => store.state.explorer.config);
const page = computed(() => store.state.explorer.page ?? 0);

const totalPages = computed(() => {
  if (!config.value) return 1;
  return Math.max(1, config.value.pages?.length ?? 0);
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

function switchButtonEnabled() {
  store.dispatch("button_enabled");
}

function switchInterfaceOutputLine() {
  store.dispatch("interface_outputLine");
}

function back() {
  if (file.value.includes(":")) {
    router.push("/");
    return;
  }
  router.push("/" + file.value.split("§").slice(0, -1).join("§"));
}

const isSettingsOpened = computed(() => {
  return store.state.layoutSettings.isOpened;
});

async function toggleSettingsOpen() {
  if (isSettingsOpened.value) {
    await save();
  }
  store.dispatch("toggle_settings_opened");
}

async function save() {
  await store.dispatch("editor_save");
}

async function del() {
  await storageService.moveToTrash(file.value);
  back();
  Telemetry.product("trash");
}

async function move(location: string) {
  const target = await storageService.moveSet(file.value, location);
  router.push("/set/" + toRoutePath(target));
  Telemetry.product("move");
}

async function duplicateSet() {
  const target = await storageService.duplicateItem(file.value);
  router.push("/set/" + toRoutePath(target));
}

async function startMerge() {
  const parentPath = file.value.split("§").slice(0, -1).join("§");
  const files = (await storageService.getFiles(parentPath)) as Directory;
  mergeOptions.value = (files ?? [])
    .filter((item) => !item.directory && pathModule.basename(item.file) !== title.value)
    .map((item) => ({
      title: pathModule.basename(item.file, ".linka"),
      value: item.file
    }));
  mergeTarget.value = "";
  mergeName.value = "";
  mergeDialog.value = true;
}

const mergeDefaultName = computed(() => {
  if (!mergeTarget.value) return "";
  return `${title.value.replace(/\.linka$/i, "")} + ${pathModule.basename(mergeTarget.value, ".linka")}`;
});

async function applyMerge() {
  const target = await storageService.mergeSets(
    file.value,
    mergeTarget.value,
    mergeName.value.trim() || mergeDefaultName.value
  );
  mergeDialog.value = false;
  router.push("/set/" + toRoutePath(target));
}

function toRoutePath(absolutePath: string) {
  return absolutePath.replace(HOME_DIR, "").replaceAll("/", "§").replaceAll("\\", "§");
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
.merge-subtitle {
  margin-bottom: 8px;
}
</style>
