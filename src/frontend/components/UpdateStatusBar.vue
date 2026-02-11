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
import { ref, onMounted } from "vue";
import { ipcRenderer } from "electron";
import { ProgressInfo } from "electron-updater";

const percent = ref(0);
const version = ref("");
const available = ref(false);
const downloaded = ref(false);
const errorMessage = ref("");

onMounted((): void => {
  ipcRenderer.send("app_version");
  ipcRenderer.on("app_version", (event, data) => {
    version.value = data.version;
  });
  ipcRenderer.on("update_info", (event, data: ProgressInfo) => {
    percent.value = data.percent;
  });

  ipcRenderer.on("update_available", () => {
    ipcRenderer.removeAllListeners("update_available");
    available.value = true;
  });

  ipcRenderer.on("update_downloaded", () => {
    ipcRenderer.removeAllListeners("update_downloaded");
    available.value = false;
    downloaded.value = true;
  });

  ipcRenderer.on("update_error", (event, message: string) => {
    errorMessage.value = message;
    available.value = false;
    downloaded.value = false;
  });
});

function update () {
  ipcRenderer.send("restart_app");
}
</script>

<style scoped>
.update-error {
  color: #c62828;
  display: block;
}
</style>
