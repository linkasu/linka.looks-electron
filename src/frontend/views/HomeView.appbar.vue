<template>
  <v-app-bar>
    <v-app-bar-title>
      {{ title || 'LINKa. смотри' }}
    </v-app-bar-title>
    <v-spacer />
    <share-button />
    <rmdir-button />
    <mkdir-button />
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
import { computed } from "vue";
import { useRoute } from "vue-router";

import MkdirButton from "@/frontend/components/HomeView/MkdirButton.vue";
import RmdirButton from "@/frontend/components/HomeView/RmdirButton.vue";
import ShareButton from "@/frontend/components/ShareButton.vue";
import store from "@/frontend/store";
import { Metric } from "@/frontend/utils/Metric";

const route = useRoute();

const root = computed(() => {
  return route.params.path.toString();
});

const title = computed(() => {
  return root.value.slice(root.value.lastIndexOf("§") + 1);
});

const newHref = computed(() => {
  return "/edit/" + root.value.replace(/\//g, "§") + "§" + "new";
});

function trackTobiiCalibrationOpen () {
  Metric.registerEvent(store.state.pcHash, "openTobiiCalibration", { platform: "darwin" });
}
</script>
