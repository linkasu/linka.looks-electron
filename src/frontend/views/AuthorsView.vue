<template>
  <v-container class="authors-view py-6">
    <v-btn class="mb-6" prepend-icon="mdi-arrow-left" variant="text" @click="$router.back()">
      Назад
    </v-btn>
    <v-card class="pa-4 pa-sm-8" rounded="xl">
      <v-card-text>
        <p class="text-overline text-primary">LINKa. смотри</p>
        <h1 class="text-h4 mb-3">Авторы программы</h1>
        <p class="text-body-1 text-medium-emphasis mb-8">
          Мы создаём LINKa, чтобы общаться было проще и каждый голос был услышан.
        </p>
        <dl class="authors-list">
          <div>
            <dt>Бакаидов Иван Александрович</dt>
            <dd>Автор идеи и ведущий разработчик</dd>
          </div>
          <div>
            <dt>Смирнова Анастасия Владиславовна</dt>
            <dd>Ведущий консультант-дефектолог</dd>
          </div>
          <div>
            <dt>Смирнов Иван</dt>
            <dd>Главный тестировщик</dd>
          </div>
        </dl>
        <v-divider class="my-8" />
        <h2 class="text-h6 mb-3">В разработке также участвовали</h2>
        <ul class="contributors">
          <li v-for="login in contributors" :key="login">{{ login }}</li>
        </ul>
        <v-divider class="my-8" />
        <h2 class="text-h6 mb-3">Связаться с нами</h2>
        <p class="mb-4">По всем вопросам обращайтесь в АНО «Линка».</p>
        <v-btn
          color="primary"
          variant="tonal"
          href="https://nkolinka.ru"
          @click.prevent="shell.openExternal('https://nkolinka.ru')"
        >
          nkolinka.ru
          <v-icon icon="mdi-open-in-new" size="small" end />
        </v-btn>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { shell } from "electron";
import contributors from "@/frontend/contributors.json";
</script>

<style scoped>
.authors-view {
  max-width: 900px;
  padding-bottom: 64px !important;
}
.authors-list {
  display: grid;
  gap: 24px;
}
.authors-list dt {
  font-size: 1.15rem;
  font-weight: 600;
}
.authors-list dd {
  margin-top: 4px;
  color: var(--linka-muted);
}
.contributors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  padding: 0;
  list-style: none;
  overflow-wrap: anywhere;
}
</style>
