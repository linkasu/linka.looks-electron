<template>
  <v-app :class="{ 'reduce-motion': !store.state.button.animation }">
    <telemetry-consent-notice />
    <template v-if="pcHash != 'unknow'">
      <download-default-sets-dialog />
      <notification-popup v-if="telemetryConsent !== 'unknown'" />
      <router-view name="appbar" />
      <audio src="./assets/sounds/button.wav" id="button_audio"></audio>
      <v-main class="app-main" :class="`app-main--${interactionMode}`">
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
import { Telemetry } from "./utils/Telemetry";

const pcHash = computed(() => store.state.pcHash);
const telemetryConsent = computed(() => store.state.telemetryConsent);
const route = useRoute();
const interactionMode = computed(() =>
  route.meta.interactionMode === "assistant" ? "assistant" : "gaze"
);

let startupTracked = false;
void store.dispatch("loadTelemetryPreference");
watch(
  telemetryConsent,
  (consent) => {
    if (startupTracked || consent !== "enabled") return;
    startupTracked = true;
    Telemetry.product("platformDetected");
    Telemetry.product("start");
  },
  { immediate: true }
);
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
  --linka-canvas: #f6f7f4;
  --linka-surface: #ffffff;
  --linka-text: #243431;
  --linka-muted: #536761;
  --linka-border: #d6e1db;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
  color: var(--linka-text);
}

.v-application,
.v-field,
.v-btn {
  font-family: inherit;
}

.v-application {
  line-height: 1.5;
}

.v-card-title {
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.35;
}

.v-card-actions {
  flex-wrap: wrap;
  gap: 8px;
  padding: 16px;
}

.v-btn,
.eyebtn {
  touch-action: manipulation;
}

:is(button, a, input, textarea, [tabindex]):focus-visible {
  outline: 3px solid rgb(var(--v-theme-primary));
  outline-offset: -3px;
}

.reduce-motion .v-btn,
.reduce-motion .v-overlay__content {
  transition: none !important;
}

@media (prefers-reduced-motion: reduce) {
  .v-btn,
  .v-overlay__content {
    transition: none !important;
  }
}

.footer {
  position: fixed;
  bottom: 0;
  width: 100%;
  height: 40px;
  background: var(--linka-canvas);
  border-top: 1px solid var(--linka-border);
  color: var(--linka-muted);
  font-size: 13px;
  align-items: center;
  padding: 0 16px;
}
</style>
