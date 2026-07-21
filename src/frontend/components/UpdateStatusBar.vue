<template>
  <section>
    <span> Версия приложения: {{ version }}. </span>
    <span v-if="available"> Доступно обновление! Идет загрузка. {{ percent.toFixed(1) }}%. </span>
    <span
      v-if="errorMessage"
      class="update-error"
    >
      Ошибка обновления: {{ errorMessage }}
    </span>
    <v-layout
      row
      justify-center
    >
      <v-dialog
        v-model="downloaded"
        persistent
        max-width="290"
      >
        <v-card>
          <v-card-title class="headline">
            Обновление загружено
          </v-card-title>
          <v-card-text> установить сейчас? </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn
              color="primary"
              flat
              @click="downloaded = false"
            >
              Нет
            </v-btn>
            <v-btn
              color="primary"
              flat
              @click="
                downloaded = false,
                update()
              "
            >
              Да
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-layout>
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

function onUpdateInfo (event: unknown, data: ProgressInfo) {
  percent.value = data.percent;
}

function onUpdateAvailable () {
  available.value = true;
  errorMessage.value = "";
  trackUpdateTelemetry("updateAvailable");
}

function onUpdateDownloaded () {
  available.value = false;
  downloaded.value = true;
  errorMessage.value = "";
  trackUpdateTelemetry("updateDownloaded");
}

function onUpdateError (event: unknown, message: string) {
  errorMessage.value = message;
  available.value = false;
  downloaded.value = false;
  trackUpdateTelemetry("updateError");
}

function update () {
  trackUpdateTelemetry("updateInstallConfirmed");
  ipcRenderer.send("restart_app");
}

function trackUpdateTelemetry (eventName: "updateAvailable" | "updateDownloaded" | "updateError" | "updateInstallConfirmed") {
  Telemetry.product(eventName);
}
</script>

<style scoped>
.update-error {
  color: #c62828;
  display: block;
}
</style>
