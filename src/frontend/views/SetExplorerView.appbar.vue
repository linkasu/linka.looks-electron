<template>
  <v-app-bar class="set-explorer-appbar">
    <v-btn flat icon title="Назад к наборам" aria-label="Назад к наборам" @click="back">
      <v-icon>mdi-arrow-left</v-icon>
    </v-btn>
    <v-app-bar-title>
      {{ title }}
    </v-app-bar-title>
    <v-spacer />
    <div v-if="config" class="page-indicator">
      {{ pageMode === "quiz" ? "Вопрос" : "Страница" }} {{ page + 1 }} из {{ totalPages }}
    </div>
    <v-spacer />
    <notes-button v-if="config?.description" :config="config" />
    <v-btn
      v-if="pageMode === 'standard'"
      flat
      icon
      :color="interfaceOutputLine ? 'primary' : ''"
      :title="(interfaceOutputLine ? 'Скрыть' : 'Показать') + ' строку вывода'"
      :aria-label="(interfaceOutputLine ? 'Скрыть' : 'Показать') + ' строку вывода'"
      @click="switchInterfaceOutputLine"
    >
      <v-icon>mdi-form-textbox</v-icon>
    </v-btn>
    <v-btn
      flat
      icon
      :color="buttonEnabled ? 'primary' : ''"
      :title="(buttonEnabled ? 'Выключить' : 'Включить') + ' управление глазами'"
      :aria-label="(buttonEnabled ? 'Выключить' : 'Включить') + ' управление глазами'"
      :aria-pressed="buttonEnabled"
      @click="switchButtonEnabled"
    >
      <v-icon>{{ buttonEnabled ? "mdi-eye" : "mdi-eye-off" }}</v-icon>
    </v-btn>
    <span v-if="!buttonEnabled" class="gaze-status" role="status">На паузе</span>
    <v-spacer />
    <v-btn
      flat
      icon
      title="Настройки отображения"
      aria-label="Настройки отображения"
      @click="toggleSettingsOpen"
    >
      <v-icon> mdi-view-dashboard-edit-outline </v-icon>
    </v-btn>
    <v-dialog v-model="toolsDialog" max-width="520">
      <template #activator="{ props }">
        <v-btn
          v-bind="props"
          class="assistant-tools"
          prepend-icon="mdi-tools"
          title="Инструменты помощника"
          aria-label="Инструменты помощника"
        >
          <span class="assistant-label">Помощнику</span>
        </v-btn>
      </template>
      <template #default="{ isActive }">
        <v-card title="Инструменты помощника">
          <v-card-text class="assistant-actions">
            <share-button text="Показать файл для отправки" />
            <v-btn prepend-icon="mdi-content-copy" @click="duplicateSet">Копировать набор</v-btn>
            <v-btn prepend-icon="mdi-merge" @click="startMerge">Объединить наборы</v-btn>
            <v-btn prepend-icon="mdi-pencil" :to="editLink">Редактировать набор</v-btn>
            <folder-button :file="file" text="Переместить набор" @move="move" />
            <delete-button :file="title" text="Удалить набор" @delete="del" />
          </v-card-text>
          <v-card-actions
            ><v-btn @click="isActive.value = false">Закрыть инструменты</v-btn></v-card-actions
          >
        </v-card>
      </template>
    </v-dialog>
    <v-dialog v-model="mergeDialog" max-width="560">
      <v-card>
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
          <p v-if="!mergeOptions.length">В этой папке нет других наборов для объединения.</p>
        </v-card-text>
        <v-card-actions>
          <v-btn color="primary" variant="flat" :disabled="!mergeTarget" @click="applyMerge">
            Создать объединённый набор
          </v-btn>
          <v-btn @click="mergeDialog = false"> Отмена </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-app-bar>
</template>

<script lang="ts" setup>
import { computed, onUnmounted, ref, watch } from "vue";
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
const toolsDialog = ref(false);
let previousToolsEnabled: boolean | null = null;
watch(toolsDialog, (open) => {
  store.commit("ui_gazeSuspended", open);
  if (open) {
    previousToolsEnabled = store.state.button.enabled;
    store.commit("button_enabled", false);
  } else if (previousToolsEnabled !== null) {
    store.commit("button_enabled", previousToolsEnabled);
    previousToolsEnabled = null;
  }
});
const mergeDialog = ref(false);
const mergeTarget = ref("");
const mergeName = ref("");
const mergeOptions = ref<{ title: string; value: string }[]>([]);

watch(
  () => route.fullPath,
  () => {
    toolsDialog.value = false;
    mergeDialog.value = false;
  }
);

const file = computed(() => route.params.path.toString());
const config = computed(() => store.state.explorer.config);
const page = computed(() => store.state.explorer.page ?? 0);
const pageMode = computed(() => config.value?.pages?.[page.value]?.mode ?? "standard");

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
  store.commit("ui_gazeSuspended", false);
  if (previousToolsEnabled !== null) store.commit("button_enabled", previousToolsEnabled);
  if (isSettingsOpened.value) {
    await toggleSettingsOpen();
  }
});
</script>

<style scoped>
.page-indicator {
  padding: 2px 10px;
  border: 1px solid var(--linka-border);
  border-radius: 12px;
  background: var(--linka-surface);
  color: var(--linka-text);
  font-weight: 600;
  white-space: nowrap;
}
.merge-subtitle {
  margin-bottom: 8px;
}
.assistant-actions {
  display: grid;
  gap: 12px;
}
.gaze-status {
  color: var(--linka-muted);
  font-size: 13px;
  white-space: nowrap;
}
@media (max-width: 650px) {
  .set-explorer-appbar :deep(.v-toolbar-title) {
    min-width: 0;
    margin-inline-start: 4px;
    font-size: 1rem;
  }
  .page-indicator {
    padding-inline: 4px;
    font-size: 0.8rem;
  }
  .assistant-tools {
    min-width: 44px;
    padding-inline: 8px;
  }
  .assistant-label {
    display: none;
  }
}
</style>
