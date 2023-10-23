<template>
  <v-dialog v-model="dialog" persistent max-width="60%">
    <v-card>
      <v-card-title v-if="!downloading" class="text-h5">
        Вы хотите скачать дополнительные наборы?
      </v-card-title>
      <v-card-title v-else>
        Идет загрузка.
      </v-card-title>
      <v-card-text v-if="!downloading">
        <p>
          Совсем скоро вы сможете начать пользоваться программой LINKa смотри, однако, сейчас в ней
          только два готовых набора. Клавиатура и цифры.
        </p>
        <p>
          Но специалист проекта Александра Анурова предоставила пакет бесплатных наборов, которые отлично
          подходят для старта работы с программой.
        </p>
        <p>
          Также вы можете записатьна на консультацию по программе по <a @click.prevent="consultation" href=""> ссылке</a>.
        </p>
        <p>Хотите их скачать?</p>
      </v-card-text>
      <v-card-text v-if="downloading">
        <v-progress-linear color="green" :model-value="progress" />
      </v-card-text>

      <v-card-actions v-if="!downloading">
        <v-spacer />
        <v-btn color="error" variant="text" @click="dialog = false">
          Отказаться
        </v-btn>
        <v-btn color="green-darken-1" variant="text" @click="download()">
          Загрузить
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { ref, onMounted, watch } from "vue";
import { useStore } from "vuex";
import { storageService } from "@/frontend/services/card-storage-service";
import { ipcRenderer, shell } from "electron";
import { LINKaStore } from "../store/LINKaStore";

const store = useStore<LINKaStore>();

const dialog = ref(false);
const downloading = ref(false);
const progress = ref(0);

onMounted((): void => {
  const newLocal = +store.state.defaultSetsDownloaded;
  console.log(newLocal);

  dialog.value = (newLocal) < 2;

  // dialog = true
  store.commit("button_enabled", !dialog.value);
  ipcRenderer.on("download_progress", (_, prog) => {
    progress.value = prog;
  });
});

async function download() {
  downloading.value = true;
  await storageService.downloadAndUnpack("https://linka.su/dist/linka.looks/sasha.sets.zip");
  dialog.value = false;
  window.location.reload();
}
async function consultation() {
  shell.openExternal("https://forms.gle/raD3VV6aCGEGzoGz7")
}

function onDialog(v: boolean) {
  if (!v) {
    store.commit("button_enabled", !v);
    store.commit("defaultSetsDownloaded", 2);
  }
}

watch(dialog, onDialog);
</script>
