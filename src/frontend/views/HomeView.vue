<template>
  <section class="root">
    <header class="folder-heading">
      <span>{{ ["Наборы", ...mroot.split("§").filter(Boolean)].join(" / ") }}</span>
      <span v-if="loading" role="status">Загрузка наборов…</span>
    </header>
    <div v-if="loadError" class="folder-state" role="alert">
      <p>Не удалось открыть папку. Проверьте доступ к файлам.</p>
      <v-btn @click="loadSets">Повторить загрузку</v-btn>
    </div>
    <div v-else-if="!loading && !sorted.length" class="folder-state" role="status">
      <p>В этой папке пока нет наборов.</p>
      <p>Создайте набор кнопкой «+» или выберите другую папку.</p>
    </div>
    <div class="folder-grid">
      <explorer-grid-button v-if="!isHome" :back="true" @click="back()" />

      <div
        v-for="file in sorted"
        :key="file.file"
        class="folder-item"
        @contextmenu.prevent="openContextMenu($event, file)"
      >
        <explorer-grid-button :file="file" @click="select(file)" />
        <v-btn
          class="item-tools"
          size="small"
          icon="mdi-dots-vertical"
          :title="'Действия помощника: ' + toDisplayName(file)"
          :aria-label="'Действия помощника: ' + toDisplayName(file)"
          @click.stop="openContextMenu($event, file)"
        />
      </div>
    </div>

    <div
      v-if="contextMenuOpen"
      class="context-menu"
      :style="{ top: contextMenuY + 'px', left: contextMenuX + 'px' }"
      @click.stop
      @contextmenu.prevent
    >
      <v-card>
        <v-card-subtitle class="pt-3">{{ contextTitle }}</v-card-subtitle>
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

    <v-dialog v-model="mergeDialog" max-width="560">
      <v-card>
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
          <v-btn color="primary" variant="flat" :disabled="!mergeTarget" @click="applyMerge">
            Создать набор
          </v-btn>
          <v-btn @click="mergeDialog = false"> Отмена </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="renameDialog" max-width="480">
      <v-card>
        <v-card-title primary-title> Переименовать </v-card-title>
        <v-card-text>
          <v-form @submit.prevent="applyRename">
            <v-text-field v-model="renameValue" label="Название" :rules="[isValidName]" />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-btn color="primary" variant="flat" @click="applyRename"> Переименовать </v-btn>
          <v-btn @click="renameDialog = false"> Отмена </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="deleteDialog" max-width="480">
      <v-card>
        <v-card-title primary-title> Удалить {{ contextTitle }}? </v-card-title>
        <v-card-text>
          {{
            contextItem?.directory
              ? "Папка со всем содержимым будет перемещена в корзину."
              : "Набор будет перемещён в корзину."
          }}
        </v-card-text>
        <v-card-actions>
          <v-btn color="error" variant="flat" @click="applyDelete"> Переместить в корзину </v-btn>
          <v-btn @click="deleteDialog = false"> Отмена </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="error" :timeout="5000">
      {{ errorText }}
      <template #actions>
        <v-btn color="primary" variant="text" @click="error = false"> Закрыть </v-btn>
      </template>
    </v-snackbar>
  </section>
</template>

<script lang="ts" setup>
import type { Ref } from "vue";
import { ref, computed, ComputedRef, watch } from "vue";
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
const loading = ref(true);
const loadError = ref(false);
const mroot = computed(() => route.params.path.toString());
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

watch(mroot, loadSets, { immediate: true });

function back() {
  router.push("/" + mroot.value.split("§").slice(0, -1).join("§"));
}

async function loadSets() {
  const folder = mroot.value;
  loading.value = true;
  loadError.value = false;
  files.value = [];
  try {
    const newFiles = await storageService.getFiles(folder);
    if (folder !== mroot.value) return;
    if (!newFiles) throw new Error("Folder unavailable");
    files.value = newFiles;
  } catch {
    if (folder === mroot.value) loadError.value = true;
  } finally {
    if (folder === mroot.value) loading.value = false;
  }
}

function select(item: DirectoryFile) {
  if (item.directory) {
    router.push("/" + mroot.value + "§" + pathModule.basename(item.file));
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
  const menuHeight = 360;
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
  display: flex;
  flex-direction: column;
  height: calc(100vh - 104px);
  overflow: hidden;
  color: var(--linka-text);
}
.folder-heading {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  color: var(--linka-muted);
  overflow-wrap: anywhere;
}
.folder-state {
  padding: 16px;
}
.folder-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  grid-auto-rows: 160px;
  align-content: start;
  min-height: 0;
  overflow-y: auto;
}
.folder-item {
  position: relative;
  min-width: 0;
}
.folder-item :deep(.eyebtn) {
  width: 100%;
  height: 100%;
}
.item-tools {
  position: absolute;
  top: 4px;
  right: 4px;
}
.context-menu {
  position: fixed;
  z-index: 2000;
  max-height: calc(100vh - 16px);
  max-width: calc(100vw - 16px);
  overflow: auto;
}
.danger {
  color: rgb(var(--v-theme-error));
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
  color: var(--linka-muted);
  font-weight: 600;
}
</style>
