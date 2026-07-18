<template>
  <v-app>
    <telemetry-consent-notice />
    <template v-if="pcHash != 'unknow'">
      <download-default-sets-dialog />
      <notification-popup v-if="telemetryConsent !== 'unknown'" />
      <router-view name="appbar" />
      <audio src="./assets/sounds/button.wav" id="button_audio"></audio>
      <v-main
        class="app-main"
        :class="`app-main--${interactionMode}`"
      >
        <router-view />
      </v-main>
      <v-footer class="footer">
        <update-status-bar />
      </v-footer>
      <!-- <bubble /> -->
    </template>
    <v-main v-else>
      <RegisterForm />
    </v-main>
  </v-app>
</template>

<script lang="ts" setup>
import { computed, watch } from "vue";
import { useRoute } from "vue-router";
import store from "./store";
import RegisterForm from "@/frontend/views/RegisterForm.vue";
import UpdateStatusBar from "@/frontend/components/UpdateStatusBar.vue";
import NotificationPopup from "@/frontend/components/NotificationPopup.vue";
import TelemetryConsentNotice from "@/frontend/components/TelemetryConsentNotice.vue";
import DownloadDefaultSetsDialog from "@/frontend/components/DownloadDefaultSetsDialog.vue";
import { Metric } from "./utils/Metric";

const pcHash = computed(() => store.state.pcHash);
const telemetryConsent = computed(() => store.state.telemetryConsent);
const route = useRoute();
const interactionMode = computed(() => route.meta.interactionMode === "assistant" ? "assistant" : "gaze");

let startupTracked = false;
watch([pcHash, telemetryConsent], ([hash, consent]) => {
  if (startupTracked || hash.length !== 36 || consent !== "enabled") return;
  startupTracked = true;
  Metric.registerEvent(hash, "platformDetected");
  Metric.registerEvent(hash, "start");
}, { immediate: true });

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
  min-height: 0;
}

.app-main--gaze {
  overflow: hidden;
}

.app-main--assistant {
  overflow-x: hidden;
  overflow-y: auto;
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
