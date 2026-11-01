<template>
  <v-app-bar>
    <v-btn icon="mdi-arrow-left" aria-label="Назад" flat @click="$router.back()" />

    <v-app-bar-title>Настройки</v-app-bar-title>
    <v-spacer />
    <span class="save-status" role="status">Изменения сохраняются автоматически</span>
  </v-app-bar>
</template>

<style scoped>
.save-status {
  max-width: 45%;
  padding: 0 16px;
  color: var(--linka-muted);
  font-size: 0.875rem;
}
</style>
