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
import { ref, onMounted, onUnmounted } from "vue";
import { ipcRenderer } from "electron";
import { ProgressInfo } from "electron-updater";
import { Telemetry } from "@/frontend/utils/Telemetry";

const percent = ref(0);
const version = ref("");
const available = ref(false);
const downloaded = ref(false);
const installDialog = ref(false);
const errorDialog = ref(false);
const errorMessage = ref("");

onMounted(async (): Promise<void> => {
  const appVersion = await ipcRenderer.invoke("app_version");
  version.value = appVersion.version;

  const state = await ipcRenderer.invoke("updater:getState");
  available.value = state.available;
  downloaded.value = state.downloaded;
  errorMessage.value = state.error;
  percent.value = state.percent;

  ipcRenderer.on("update_info", onUpdateInfo);
  ipcRenderer.on("update_available", onUpdateAvailable);
  ipcRenderer.on("update_downloaded", onUpdateDownloaded);
  ipcRenderer.on("update_error", onUpdateError);
});

onUnmounted((): void => {
  ipcRenderer.off("update_info", onUpdateInfo);
  ipcRenderer.off("update_available", onUpdateAvailable);
  ipcRenderer.off("update_downloaded", onUpdateDownloaded);
  ipcRenderer.off("update_error", onUpdateError);
});

function onUpdateInfo(event: unknown, data: ProgressInfo) {
  percent.value = data.percent;
}

function onUpdateAvailable() {
  available.value = true;
  errorMessage.value = "";
  trackUpdateTelemetry("updateAvailable");
}

function onUpdateDownloaded() {
  available.value = false;
  downloaded.value = true;
  errorMessage.value = "";
  trackUpdateTelemetry("updateDownloaded");
}

function onUpdateError(event: unknown, message: string) {
  errorMessage.value = message;
  available.value = false;
  downloaded.value = false;
  installDialog.value = false;
  trackUpdateTelemetry("updateError");
}

function update() {
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
