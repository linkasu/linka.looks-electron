<template>
  <v-app-bar>
    <v-app-bar-title>
      {{ title || 'LINKa. смотри' }}
    </v-app-bar-title>
    <v-spacer />
    <share-button />
    <rmdir-button />
    <mkdir-button />
    <v-tooltip v-if="$platform.isMacOS" location="bottom">
      <template #activator="{ props }">
        <v-chip
          v-bind="props"
          class="mr-2"
          :color="tobiiStatusColor"
          size="small"
          variant="tonal"
          @click="restartTobiiService"
        >
          <v-icon start>{{ tobiiStatusIcon }}</v-icon>
          {{ tobiiStatusTitle }}
        </v-chip>
      </template>
      <div>{{ tobiiStatusMessage }}</div>
      <div v-if="tobiiStatus?.lastError">
        Ошибка: {{ tobiiStatus.lastError }}
      </div>
      <div v-if="tobiiStatus?.lastGazeAt">
        Последний взгляд: {{ formatLastGazeAt(tobiiStatus.lastGazeAt) }}
      </div>
      <div v-if="tobiiStatus?.socketPath">
        Socket: {{ tobiiStatus.socketPath }}
      </div>
      <div>Нажмите, чтобы перезапустить службу Tobii.</div>
    </v-tooltip>
    <v-btn
      v-if="$platform.isMacOS"
      flat
      icon
      to="/tobii-calibration"
      aria-label="Калибровка Tobii"
      @click="trackTobiiCalibrationOpen"
    >
      <v-icon>mdi-eye</v-icon>
    </v-btn>
    <v-btn
      flat
      icon
      :to="newHref"
    >
      <v-icon>mdi-plus</v-icon>
    </v-btn>
    <v-btn
      flat
      icon
      to="/settings"
    >
      <v-icon>mdi-cog</v-icon>
    </v-btn>
  </v-app-bar>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { ipcRenderer, type IpcRendererEvent } from "electron";

import MkdirButton from "@/frontend/components/HomeView/MkdirButton.vue";
import RmdirButton from "@/frontend/components/HomeView/RmdirButton.vue";
import ShareButton from "@/frontend/components/ShareButton.vue";
import store from "@/frontend/store";
import { Metric } from "@/frontend/utils/Metric";
import type { TobiiStatus } from "@linkasu/tobii-electron/main";

const route = useRoute();
const tobiiStatus = ref<TobiiStatus>();

const root = computed(() => {
  return route.params.path.toString();
});

const title = computed(() => {
  return root.value.slice(root.value.lastIndexOf("§") + 1);
});

const newHref = computed(() => {
  return "/edit/" + root.value.replace(/\//g, "§") + "§" + "new";
});

const tobiiStatusTitle = computed(() => {
  if (!tobiiStatus.value) return "Tobii";
  if (tobiiStatus.value.state === "tracking" || tobiiStatus.value.state === "connected") return "Tobii ok";
  if (tobiiStatus.value.state === "waiting_device") return "Tobii нет";
  if (tobiiStatus.value.state === "error" || tobiiStatus.value.state === "service_unavailable") return "Tobii ошибка";
  return "Tobii...";
});

const tobiiStatusMessage = computed(() => tobiiStatus.value?.message || "Статус Tobii пока неизвестен");

const tobiiStatusIcon = computed(() => {
  if (!tobiiStatus.value) return "mdi-eye";
  if (tobiiStatus.value.state === "tracking" || tobiiStatus.value.state === "connected") return "mdi-eye-check";
  if (tobiiStatus.value.state === "waiting_device") return "mdi-eye-off";
  if (tobiiStatus.value.state === "error" || tobiiStatus.value.state === "service_unavailable") return "mdi-alert-circle";
  return "mdi-sync";
});

const tobiiStatusColor = computed(() => {
  if (!tobiiStatus.value) return "grey";
  if (tobiiStatus.value.state === "tracking" || tobiiStatus.value.state === "connected") return "success";
  if (tobiiStatus.value.state === "waiting_device") return "warning";
  if (tobiiStatus.value.state === "error" || tobiiStatus.value.state === "service_unavailable") return "error";
  return "info";
});

function trackTobiiCalibrationOpen () {
  Metric.registerEvent(store.state.pcHash, "openTobiiCalibration");
}

function onTobiiStatus (event: IpcRendererEvent, status: TobiiStatus) {
  tobiiStatus.value = status;
}

async function loadTobiiStatus () {
  try {
    tobiiStatus.value = await ipcRenderer.invoke("tobii:status:get");
  } catch (error) {
    tobiiStatus.value = {
      state: "service_unavailable",
      mode: "socket-service",
      message: error instanceof Error ? error.message : String(error),
      deviceFound: false,
      updatedAt: Date.now()
    };
  }
}

async function restartTobiiService () {
  try {
    await ipcRenderer.invoke("tobii:service:restart");
  } catch (error) {
    tobiiStatus.value = {
      ...(tobiiStatus.value || {
        state: "service_unavailable",
        mode: "socket-service",
        message: "Служба Tobii недоступна",
        deviceFound: false,
        updatedAt: Date.now()
      }),
      state: "service_unavailable",
      message: error instanceof Error ? error.message : String(error),
      lastError: error instanceof Error ? error.message : String(error),
      updatedAt: Date.now()
    };
  }
}

function formatLastGazeAt (value: number) {
  return new Date(value).toLocaleTimeString();
}

onMounted(() => {
  void loadTobiiStatus();
  ipcRenderer.on("tobii:status", onTobiiStatus);
});

onBeforeUnmount(() => {
  ipcRenderer.off("tobii:status", onTobiiStatus);
});
</script>
