<template>
  <section class="update-status">
    <span class="version"> Версия {{ version }} </span>
    <span v-if="available" role="status"> Загрузка обновления: {{ percent.toFixed(1) }}% </span>
    <button v-if="downloaded" class="status-action" @click="installDialog = true">
      Обновление готово — установить
    </button>
    <button v-if="errorMessage" class="status-action update-error" @click="errorDialog = true">
      Ошибка обновления — подробнее
    </button>
    <v-dialog v-model="installDialog" max-width="480">
      <v-card>
        <v-card-title class="headline"> Обновление загружено </v-card-title>
        <v-card-text>
          Установка перезапустит приложение. Сначала завершите занятие и сохраните изменения.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="installDialog = false"> Позже </v-btn>
          <v-btn color="primary" variant="flat" @click="((installDialog = false), update())">
            Установить и перезапустить
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="errorDialog" max-width="560" scrollable>
      <v-card title="Не удалось обновить приложение">
        <v-card-text class="error-details">{{ errorMessage }}</v-card-text>
        <v-card-actions><v-btn @click="errorDialog = false">Закрыть</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<script lang="ts" setup>
import { ref, reactive, toRefs, watch, onMounted, onUnmounted } from "vue";
import { useStore } from "vuex";
import { ipcRenderer } from "electron";
import { ProgressInfo } from "electron-updater";
import { Telemetry } from "@/frontend/utils/Telemetry";

const store = useStore();
const state = reactive({ percent: 0, available: false, downloaded: false, error: "" });
const { percent, available, downloaded, error: errorMessage } = toRefs(state);
const version = ref("");
const installDialog = ref(false);
const errorDialog = ref(false);
let pendingUpdates: Partial<typeof state> | null = {};
let unmounted = false;
let restartRequested = false;

const stopModalWatch = watch(
  () => installDialog.value || errorDialog.value,
  (open) => {
    store.commit("ui_gazeSuspended", { owner: "updater", suspended: open });
  },
  { flush: "sync" }
);

onMounted((): void => {
  ipcRenderer.on("update_info", onUpdateInfo);
  ipcRenderer.on("update_available", onUpdateAvailable);
  ipcRenderer.on("update_downloaded", onUpdateDownloaded);
  ipcRenderer.on("update_error", onUpdateError);
  void loadVersion();
  void loadState();
});

onUnmounted((): void => {
  unmounted = true;
  pendingUpdates = null;
  stopModalWatch();
  store.commit("ui_gazeSuspended", { owner: "updater", suspended: false });
  ipcRenderer.off("update_info", onUpdateInfo);
  ipcRenderer.off("update_available", onUpdateAvailable);
  ipcRenderer.off("update_downloaded", onUpdateDownloaded);
  ipcRenderer.off("update_error", onUpdateError);
});

async function loadVersion() {
  try {
    const appVersion = await ipcRenderer.invoke("app_version");
    if (!unmounted) version.value = appVersion.version;
  } catch {
    if (!unmounted) version.value = "неизвестна";
  }
}

async function loadState() {
  try {
    const snapshot = await ipcRenderer.invoke("updater:getState");
    if (!unmounted) Object.assign(state, snapshot, pendingUpdates);
  } catch {
    if (!unmounted && !Object.keys(pendingUpdates ?? {}).length) {
      errorMessage.value = "Не удалось получить состояние обновления. Попробуйте позже.";
    }
  } finally {
    pendingUpdates = null;
  }
}

function applyLiveState(update: Partial<typeof state>) {
  if (pendingUpdates) Object.assign(pendingUpdates, update);
  Object.assign(state, update);
}

function onUpdateInfo(event: unknown, data: ProgressInfo) {
  applyLiveState({ percent: data.percent });
}

function onUpdateAvailable() {
  applyLiveState({ available: true, downloaded: false, error: "" });
  trackUpdateTelemetry("updateAvailable");
}

function onUpdateDownloaded() {
  applyLiveState({ available: false, downloaded: true, error: "" });
  trackUpdateTelemetry("updateDownloaded");
}

function onUpdateError(event: unknown, message: string) {
  applyLiveState({ error: message, available: false, downloaded: false });
  installDialog.value = false;
  trackUpdateTelemetry("updateError");
}

function update() {
  if (restartRequested || !downloaded.value) return;
  restartRequested = true;
  trackUpdateTelemetry("updateInstallConfirmed");
  ipcRenderer.send("restart_app");
}

function trackUpdateTelemetry(
  eventName: "updateAvailable" | "updateDownloaded" | "updateError" | "updateInstallConfirmed"
) {
  Telemetry.product(eventName);
}
</script>

<style scoped>
.update-error {
  color: rgb(var(--v-theme-error));
}
.update-status {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  font-size: 0.8rem;
}
.status-action {
  text-decoration: underline;
  text-underline-offset: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.error-details {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
:deep(.v-card-title) {
  white-space: normal;
}
:deep(.v-card-actions) {
  flex-wrap: wrap;
}
@media (max-width: 650px) {
  .version {
    display: none;
  }
}
</style>
