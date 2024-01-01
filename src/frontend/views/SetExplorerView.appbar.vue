<template>
  <v-app-bar>
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
      @click="openSettings"
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
  <div class="settingsPanel" v-if="isSettingsPanelOpen===true">
    <v-btn variant="text" @click="closeSettings" size="x-small" class="btn_close">
      Закрыть
      <v-icon>mdi-close</v-icon>
    </v-btn>
    <layout-settings-panel></layout-settings-panel>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from "vue";
import DeleteButton from "@/frontend/components/SetExplorer/DeleteButton.vue";
import FolderButton from "@/frontend/components/SetExplorer/FolderButton.vue";
import NotesButton from "@/frontend/components/SetExplorer/NotesButton.vue";

import { useStore } from "vuex";
import { useRoute, useRouter } from "vue-router";

import { storageService } from "@/frontend/services/card-storage-service";
import ShareButton from "@/frontend/components/ShareButton.vue";
import LayoutSettingsPanel from "@/frontend/components/LayoutSettings/LayoutSettingsPanel.vue";
import { Metric } from "@/frontend/utils/Metric";
import pathModule from "path";

const route = useRoute();
const router = useRouter();
const store = useStore();

const file = computed(() => route.params.path.toString());
const config = computed(() => store.state.explorer.config);

const isSettingsPanelOpen = ref(false);

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

const animation = computed(() => {
  return store.state.button.animation;
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

function switchAnimation () {
  store.dispatch("button_animation_toggle");
}

function openSettings () {
  if(!isSettingsPanelOpen.value) {
    isSettingsPanelOpen.value = true;
  }
}

async function closeSettings () {
  if(isSettingsPanelOpen.value) {
    await save();
    isSettingsPanelOpen.value = false;
  }
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
</script>
<style scoped>
.settingsPanel {
  margin-top: 64px;
  position: fixed;
  z-index: 1005;
  width: 100%;
  background-color: #ffffff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 25%);
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
}
.btn_close {
  align-self: flex-end;
}
</style>