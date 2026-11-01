<template>
  <v-card>
    <v-card-title primary-title> Клавиатура и джойстик </v-card-title>
    <v-card-text>
      <p>
        Выберите «Назначить», затем нажмите нужную клавишу или кнопку джойстика. Существующие
        назначения сохранятся. Escape отменяет ожидание. Назначьте перемещение между карточками и
        кнопку активации; включение способов активации настраивается отдельно выше.
      </p>
      <v-container>
        <v-row>
          <v-col v-for="side in sides" :key="side" cols="12" sm="6">
            <key-binding :side="side" />
          </v-col>
        </v-row>
      </v-container>
    </v-card-text>
  </v-card>
</template>

<script lang="ts" setup>
import { ref } from "vue";
import KeyBinding from "./KeyBinding.vue";
import { useStore } from "vuex";

const store = useStore();

const sides = ref(Object.keys(store.state.keyMapping));
</script>
