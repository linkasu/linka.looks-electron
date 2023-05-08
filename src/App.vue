<template>
  <v-app>
    <router-view name="appbar" />

    <v-main style="margin-bottom: 40px;">
      <router-view />
    </v-main>
    <v-footer class="footer">
        <update-status-bar/>
    </v-footer>
  </v-app>
</template>

<script lang="ts" setup>
import { ref } from "vue";
import { Vue } from "vue-class-component";
import store from "./store";
import { computed } from "vue";
import UpdateStatusBar from "@/components/UpdateStatusBar.vue";

const primary = computed(()=>{
  
  return hexToRGB( store.state.colors.primary)
})
const accent = computed(()=>{
  return hexToRGB( store.state.colors.accent)
})
const secondary = computed(()=>{
  return hexToRGB( store.state.colors.secondary)
})

function hexToRGB(input: string) {
  const aRgbHex = input.slice(1).match(/.{1,2}/g);
  if (!aRgbHex) return null;
  const aRgb = [
    parseInt(aRgbHex[0], 16),
    parseInt(aRgbHex[1], 16),
    parseInt(aRgbHex[2], 16),
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
.footer{
  position: fixed;
  bottom: 0;
  width: 100%;
  background: #fdfdfd;
}
</style>