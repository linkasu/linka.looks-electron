<template>
  <v-dialog
    :model-value="showPopup"
    max-width="560"
    scrollable
    @update:model-value="!$event && closePopup()"
  >
    <v-card v-if="pData">
      <v-card-title>
        <span class="headline">{{ pData.title }}</span>
      </v-card-title>
      <v-card-text>{{ pData.description }}</v-card-text>
      <v-card-text>
        <v-list dense>
          <v-list-item v-for="(value, key) in pData.links" :key="key">
            <v-list-item-title>
              <a :href="key.toString()" @click.prevent="openLink(key.toString())">{{ value }}</a>
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn color="primary" @click="closePopup"> Закрыть </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import type { Ref } from "vue";
import { ref, computed, onMounted } from "vue";

import { useStore } from "vuex";
import { useRoute } from "vue-router";

import axios from "axios";
import { shell } from "electron";

interface PopupData {
  version: number;
  title: string;
  description: string;
  links: { [url: string]: string };
}

type Nullable<T> = T | null;

const store = useStore();
const route = useRoute();

const pData: Ref<Nullable<PopupData>> = ref(null);
const showPopup = computed(() => {
  return route.name === "home" && !!pData.value && pData.value.version > store.state.popupVersion;
});

onMounted((): void => {
  fetch();
});

async function fetch() {
  try {
    const request = await axios.get<PopupData>("https://linka.su/looks.popup.json");

    pData.value = request.data;
  } catch (error) {
    void error;
  }
}

function closePopup() {
  store.commit("popupVersion", pData.value?.version ?? 0);
}

function openLink(url: string) {
  shell.openExternal(url);
}
</script>

<style scoped>
:deep(.v-card-title),
:deep(.v-list-item-title) {
  white-space: normal;
  overflow-wrap: anywhere;
}
</style>
