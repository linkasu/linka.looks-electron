<template>
  <v-card>
    <v-card-title primary-title>
      Настройки кнопок
    </v-card-title>
    <v-card-text>
      <v-container>
        <v-row>
          <v-col
            v-for="side in sides"
            :key="side"
            cols="3"
            xs="4"
          >
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
