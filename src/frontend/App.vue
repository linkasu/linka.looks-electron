<template>
  <v-app v-if="user !== null && user !== undefined">
    <download-default-sets-dialog />
    <notification-popup />
    <router-view name="appbar" />
    <audio src="./assets/sounds/button.wav" id="button_audio"></audio>
    <v-main style="margin-bottom: 40px">
      <router-view />
    </v-main>
    <v-footer class="footer">
      <update-status-bar />
    </v-footer>
    <!-- <bubble /> -->
  </v-app>
  <v-app v-if="user === null">
    <v-main>
      <RegisterForm />
    </v-main>
  </v-app>
</template>

<script lang="ts" setup>
import { computed, onMounted } from "vue";
import store from "./store";
import RegisterForm from "@/frontend/views/RegisterForm.vue";
import UpdateStatusBar from "@/frontend/components/UpdateStatusBar.vue";
import NotificationPopup from "@/frontend/components/NotificationPopup.vue";
import DownloadDefaultSetsDialog from "@/frontend/components/DownloadDefaultSetsDialog.vue";
import { Metric } from "./utils/Metric";

const user = computed(() => store.state.user);

onMounted(() => {
  if (user.value) {
    Metric.registerEvent("start");
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
  overflow: scroll;
}

* {
  --v-theme-primary: v-bind(primary) !important;
  --v-theme-accent: v-bind(accent) !important;
  --v-theme-secondary: v-bind(secondary) !important;
}

.footer {
  position: fixed;
  bottom: 0;
  width: 100%;
  background: #fdfdfd;
}
</style>
