<template>
  <v-app>
    <router-view name="appbar" />

    <v-main>
      <router-view />
    </v-main>
  </v-app>
</template>

<script lang="ts">
import { Vue } from "vue-class-component";

export default class App extends Vue {}
</script>

<style>
#app {
  height: 100vh;
  overflow: hidden;
}
</style>
