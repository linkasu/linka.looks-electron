<template>
  <v-app-bar>
    <v-btn icon="mdi-arrow-left" flat @click="$router.back()" />

    <v-app-bar-title>Настройки</v-app-bar-title>
    <v-spacer />
    <v-btn flat disabled color="red">Настройки сохраняются автоматически</v-btn >
  </v-app-bar>
</template>
