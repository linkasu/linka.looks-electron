<template>
  <v-app v-if="pcHash != 'unknow'">
    <download-default-sets-dialog />
    <notification-popup />
    <router-view name="appbar" />
    <audio src="./assets/sounds/button.wav" id="button_audio"></audio>
    <v-main class="app-main">
      <router-view />
    </v-main>
    <v-footer class="footer">
      <update-status-bar />
    </v-footer>
    <!-- <bubble /> -->
  </v-app>
  <v-app v-else>
    <v-main>
      <RegisterForm />
    </v-main>
  </v-app>
</template>

<script lang="ts" setup>
import { computed, onMounted } from "vue";
import { ipcRenderer } from "electron";
import store from "./store";
import RegisterForm from "@/frontend/views/RegisterForm.vue";
import UpdateStatusBar from "@/frontend/components/UpdateStatusBar.vue";
import NotificationPopup from "@/frontend/components/NotificationPopup.vue";
import DownloadDefaultSetsDialog from "@/frontend/components/DownloadDefaultSetsDialog.vue";
import { Metric } from "./utils/Metric";
import { platform } from "@/frontend/plugins/platform";

const pcHash = computed(() => store.state.pcHash);

onMounted(async () => {
  if (pcHash.value.length === 36) {
    const appInfo = await ipcRenderer.invoke("app_version");
    const payload = {
      platform: appInfo.platform || platform.name,
      version: appInfo.version,
      isPackaged: appInfo.isPackaged
    };
    Metric.registerEvent(pcHash.value, "platformDetected", payload);
    Metric.registerEvent(pcHash.value, "start", payload);
  }
});

const primary = computed(() => {
  return hexToRGB(store.state.colors.primary);
});
const accent = computed(() => {
  return hexToRGB(store.state.colors.accent);
});
const secondary = computed(() => {
  return hexToRGB(store.state.colors.secondary);
});

function hexToRGB (input: string) {
  const aRgbHex = input.slice(1).match(/.{1,2}/g);
  if (!aRgbHex) return null;
  const aRgb = [
    parseInt(aRgbHex[0], 16),
    parseInt(aRgbHex[1], 16),
    parseInt(aRgbHex[2], 16)
  ];
  return aRgb;
}
</script>

<style>
#app {
  height: 100vh;
  overflow: hidden;
}

.app-main {
  height: calc(100vh - 40px);
  overflow: hidden;
}

:root {
  --v-theme-primary: v-bind(primary) !important;
  --v-theme-accent: v-bind(accent) !important;
  --v-theme-secondary: v-bind(secondary) !important;
}

.footer {
  position: fixed;
  bottom: 0;
  width: 100%;
  height: 40px;
  background: #fdfdfd;
  align-items: center;
  padding: 0 16px;
}
</style>
