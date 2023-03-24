<template>
  <v-app>
    <v-app-bar>
      <v-app-bar-title>
        LINKa. смотри
      </v-app-bar-title>
    </v-app-bar>
    <v-main>
      <router-view/>
    </v-main>
  </v-app>
</template>

<script lang="ts">
import {Vue} from 'vue-class-component'

export default class App extends Vue {
  
}
</script>
