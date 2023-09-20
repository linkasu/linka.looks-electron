<template>
  <v-dialog v-model="showPopup" persistent max-width="500px">
    <v-card v-if="pData">
      <v-card-title>
        <span class="headline">{{ pData.title }}</span>
      </v-card-title>
      <v-card-text>{{ pData.description }}</v-card-text>
      <v-card-text>
        <v-list dense>
          <v-list-item v-for="(value, key) in pData.links" :key="key">
            <v-list-item-title>
              <a @click.prevent="openLink(key.toString())" :href="key.toString()">{{ value }}</a>
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn color="primary" @click="closePopup">Закрыть</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import type { Ref } from "vue";
import { ref, computed, onMounted } from "vue";

import { useStore } from "vuex";

import axios from "axios";
import { shell } from "electron";

interface PopupData {
  version: number;
  title: string;
  description: string;
  links: { [url: string]: string };
}

type Nullable<T> = T | null

const store = useStore();

const pData: Ref<Nullable<PopupData>> = ref(null);
const showPopup = computed(() => {
  return !!pData.value && pData.value.version > store.state.popupVersion;
})

onMounted((): void => {
  fetch();
});

async function fetch () {
  const request = await axios.get<PopupData>("https://linka.su/looks.popup.json");
  console.log(request.data);

  pData.value = request.data;
}

function closePopup () {
  store.commit("popupVersion", pData.value?.version ?? 0);
}

function openLink (url: string) {
  shell.openExternal(url);
}
</script>
