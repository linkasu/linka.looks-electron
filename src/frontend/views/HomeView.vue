<template>
  <v-layout full-height class="root">
    <explorer-grid-button v-if="!isHome" :back="true" @click="back()" />

    <explorer-grid-button
      v-for="file in sorted"
      :key="file.file"
      :file="file"
      @click="select(file)"
      @contextmenu.prevent="openContextMenu($event, file)"
    />

    <div
      v-if="contextMenuOpen"
      class="context-menu"
      :style="{ top: contextMenuY + 'px', left: contextMenuX + 'px' }"
      @click.stop
      @contextmenu.prevent
    >
      <v-card>
        <v-list density="compact">
          <v-list-item @click="openSelected">
            <v-list-item-title>Открыть</v-list-item-title>
          </v-list-item>
          <v-list-item @click="duplicateSelected">
            <v-list-item-title>Дублировать</v-list-item-title>
          </v-list-item>
          <v-list-item @click="startRename">
            <v-list-item-title>Переименовать</v-list-item-title>
          </v-list-item>
          <v-list-item @click="confirmDelete">
            <v-list-item-title class="danger">Удалить</v-list-item-title>
          </v-list-item>
          <v-list-item @click="showInFolder">
            <v-list-item-title>Показать в папке</v-list-item-title>
          </v-list-item>
          <v-list-item v-if="!contextItem?.directory" @click="startMerge">
            <v-list-item-title>Объединить...</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-card>
    </div>

    <v-dialog v-model="mergeDialog" width="auto">
      <v-card min-width="340px">
        <v-card-title primary-title> Объединить наборы </v-card-title>
        <v-card-text>
          <div class="merge-subtitle">Основной: {{ contextTitle }}</div>
          <v-text-field
            v-model="mergeName"
            label="Имя нового набора"
            :rules="[isValidMergeName]"
            :placeholder="mergeDefaultName"
          />
          <v-btn variant="text" @click="mergeName = mergeDefaultName"> По умолчанию </v-btn>
          <v-select
            v-model="mergeTarget"
            :items="mergeOptions"
            label="Второй набор"
            item-title="title"
            item-value="value"
          />
          <div class="merge-hint">Новый набор будет создан рядом с основным.</div>
          <div v-if="mergeWarning" class="merge-warning">
            {{ mergeWarning }}
          </div>
        </v-card-text>
        <v-card-actions>
          <v-btn color="primary" :disabled="!mergeTarget" @click="applyMerge"> Объединить </v-btn>
          <v-btn color="primary" @click="mergeDialog = false"> Отмена </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="renameDialog" width="auto">
      <v-card min-width="300px">
        <v-card-title primary-title> Переименовать </v-card-title>
        <v-card-text>
          <v-form @submit.prevent="applyRename">
            <v-text-field v-model="renameValue" label="Название" :rules="[isValidName]" />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-btn color="primary" @click="applyRename"> Сохранить </v-btn>
          <v-btn color="primary" @click="renameDialog = false"> Отмена </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="deleteDialog" width="auto">
      <v-card min-width="300px">
        <v-card-title primary-title> Удалить {{ contextTitle }}? </v-card-title>
        <v-card-text> Вы уверены? </v-card-text>
        <v-card-actions>
          <v-btn color="error" @click="applyDelete"> Да </v-btn>
          <v-btn color="primary" @click="deleteDialog = false"> Нет </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="error" :timeout="5000">
      {{ errorText }}
      <template #actions>
        <v-btn color="blue" variant="text" @click="error = false"> Закрыть </v-btn>
      </template>
    </v-snackbar>
  </v-layout>
</template>

<script lang="ts" setup>
import type { Ref } from "vue";
import { ref, computed, ComputedRef, watch, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { validateStorageName } from "@/common/utils/storageName";

import ExplorerGridButton from "@/frontend/components/HomeView/ExplorerGridButton.vue";
import { Directory, DirectoryFile } from "@/common/interfaces/Directory";
import pathModule from "path";
import { storageService } from "@/frontend/services/card-storage-service";
import { Telemetry } from "@/frontend/utils/Telemetry";

const router = useRouter();
const route = useRoute();

const files: Ref<Directory> = ref([]);
const mroot = ref("");
const contextMenuOpen = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);
const contextItem: Ref<DirectoryFile | null> = ref(null);
const renameDialog = ref(false);
const renameValue = ref("");
const deleteDialog = ref(false);
const error = ref(false);
const errorText = ref("");
const mergeDialog = ref(false);
const mergeTarget = ref("");
const mergeName = ref("");

onMounted(() => {
  mroot.value = route.params.path.toString();
});

const sorted: ComputedRef<Directory> = computed(() => {
  return [...files.value].sort((a: DirectoryFile, b: DirectoryFile) => {
    if (a.directory !== b.directory) return a.directory ? -1 : 1;
    return toDisplayName(a).localeCompare(toDisplayName(b), "ru", {
      numeric: true,
      sensitivity: "base"
    });
  });
});

const isHome = computed(() => {
  return mroot.value === "§";
});

// const root = computed({
//   get () {
//     return mroot.value;
//   },
//   set (v: string) {
//     mroot.value = v;
//     router.push(v);
//     loadSets();
//   }
// });

watch(mroot, () => {
  router.push(mroot.value);
  loadSets();
});

function back() {
  mroot.value = mroot.value.split("§").slice(0, -1).join("§");
}

function loadSets() {
  storageService.getFiles(mroot.value).then((newFiles: Directory) => {
    if (!newFiles) return;
    files.value = newFiles;
  });
}

function select(item: DirectoryFile) {
  if (item.directory) {
    mroot.value += "§" + pathModule.basename(item.file);
    Telemetry.product("openFolder");
  } else {
    router.push("/set/" + mroot.value.replace(/\//g, "§") + "§" + pathModule.basename(item.file));
  }
}

const contextTitle = computed(() => {
  if (!contextItem.value) return "";
  return toBasename(contextItem.value.file);
});

function toBasename(path: string) {
  return pathModule.basename(path);
}

function toDisplayName(item: DirectoryFile) {
  const name = toBasename(item.file);
  if (!item.directory && name.toLowerCase().endsWith(".linka")) {
    return name.slice(0, -".linka".length);
  }
  return name;
}

function buildMergeName(basePath: string, otherPath: string) {
  const ext = ".linka";
  const baseName = pathModule.basename(basePath, ext);
  const otherName = pathModule.basename(otherPath, ext);
  return `${baseName} + ${otherName}`;
}

function openContextMenu(event: MouseEvent, item: DirectoryFile) {
  contextItem.value = item;
  const menuWidth = 220;
  const menuHeight = 220;
  const x = Math.min(event.clientX, window.innerWidth - menuWidth);
  const y = Math.min(event.clientY, window.innerHeight - menuHeight);
  contextMenuX.value = Math.max(8, x);
  contextMenuY.value = Math.max(8, y);
  contextMenuOpen.value = true;
  window.addEventListener("click", closeContextMenu, { once: true });
}

function closeContextMenu() {
  contextMenuOpen.value = false;
}

function openSelected() {
  if (!contextItem.value) return;
  closeContextMenu();
  select(contextItem.value);
}

async function duplicateSelected() {
  if (!contextItem.value) return;
  closeContextMenu();
  try {
    await storageService.duplicateItem(contextItem.value.file);
    loadSets();
  } catch {
    errorText.value = "Ошибка дублирования";
    error.value = true;
  }
}

function startRename() {
  if (!contextItem.value) return;
  closeContextMenu();
  renameValue.value = toDisplayName(contextItem.value);
  renameDialog.value = true;
}

function isValidName(text: string) {
  return validateStorageName(text);
}

function isValidMergeName(text: string) {
  if (!text || !text.trim()) return true;
  return validateStorageName(text);
}

async function applyRename() {
  if (!contextItem.value) return;
  if (isValidName(renameValue.value) !== true) return;
  let name = renameValue.value.trim();
  if (!contextItem.value.directory && !name.toLowerCase().endsWith(".linka")) {
    name += ".linka";
  }
  try {
    await storageService.renameItem(contextItem.value.file, name);
    loadSets();
  } catch {
    errorText.value = "Ошибка переименования";
    error.value = true;
  } finally {
    renameDialog.value = false;
  }
}

function confirmDelete() {
  if (!contextItem.value) return;
  closeContextMenu();
  deleteDialog.value = true;
}

async function applyDelete() {
  if (!contextItem.value) return;
  try {
    await storageService.moveToTrash(contextItem.value.file);
    loadSets();
  } catch {
    errorText.value = "Ошибка удаления";
    error.value = true;
  } finally {
    deleteDialog.value = false;
  }
}

async function showInFolder() {
  if (!contextItem.value) return;
  closeContextMenu();
  try {
    await storageService.showItemInFolder(contextItem.value.file);
  } catch {
    errorText.value = "Ошибка открытия папки";
    error.value = true;
  }
}

const mergeOptions = computed(() => {
  if (!contextItem.value) return [];
  return files.value
    .filter((f) => !f.directory && f.file !== contextItem.value?.file)
    .map((f) => ({
      title: toDisplayName(f),
      value: f.file
    }));
});

function startMerge() {
  if (!contextItem.value || contextItem.value.directory) return;
  closeContextMenu();
  if (!mergeOptions.value.length) {
    errorText.value = "Нет другого набора для объединения";
    error.value = true;
    return;
  }
  mergeTarget.value = "";
  mergeName.value = "";
  mergeDialog.value = true;
}

const mergeDefaultName = computed(() => {
  if (!contextItem.value || !mergeTarget.value) return "";
  return buildMergeName(contextItem.value.file, mergeTarget.value);
});

const mergeWarning = computed(() => {
  if (!contextItem.value || !mergeTarget.value) return "";
  const baseConfig = contextItem.value.set;
  const other = files.value.find((f) => f.file === mergeTarget.value);
  const otherConfig = other?.set;
  if (!baseConfig || !otherConfig) return "";
  return `Страницы будут добавлены после "${toDisplayName(contextItem.value)}".`;
});

async function applyMerge() {
  if (!contextItem.value || !mergeTarget.value) return;
  if (isValidMergeName(mergeName.value) !== true) return;
  const targetName = mergeName.value.trim() || mergeDefaultName.value;
  try {
    await storageService.mergeSets(contextItem.value.file, mergeTarget.value, targetName);
    loadSets();
  } catch {
    errorText.value = "Ошибка объединения";
    error.value = true;
  } finally {
    mergeDialog.value = false;
  }
}
</script>

<style scoped>
.root {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  grid-auto-rows: 160px;
  align-content: start;
  /* 64px app bar + 40px fixed footer. Subtracting only the app bar left the
     last row under the footer, unreachable even scrolled to the bottom.
     EditorView already uses the same 104px. */
  height: calc(100vh - 104px);
  overflow-y: auto !important;
}
.context-menu {
  position: fixed;
  z-index: 2000;
}
.danger {
  color: #b00020;
  font-weight: 600;
}
.merge-subtitle {
  margin-bottom: 8px;
}
.merge-hint {
  margin-top: 8px;
  opacity: 0.7;
}
.merge-warning {
  margin-top: 8px;
  color: #b00020;
  font-weight: 600;
}
</style>
