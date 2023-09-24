<template>
  <v-dialog
    v-model="dialog"
    persistent
    max-width="60%"
  >
    <v-card>
      <v-card-title
        v-if="!downloading"
        class="text-h5"
      >
        Вы хотите скачать дополнительные наборы?
      </v-card-title>
      <v-card-title v-else>
        Идет загрузка.
      </v-card-title>
      <v-card-text v-if="!downloading">
        <o>
          Совсем скоро вы сможете начать пользоваться программой LINKa смотри, однако, сейчас в ней
          только два готовых набора. Клавиатура и цифры.
        </o>
        <p>
          Но дефектолог Ольга Унгуряну предоставила пакет бесплатных наборов, которые отлично
          подходят для старта работы с программой.
        </p>
        <p>Хотите их скачать?</p>
      </v-card-text>
      <v-card-text v-if="downloading">
        <v-progress-linear
          color="green"
          :model-value="progress"
        />
      </v-card-text>

      <v-card-actions v-if="!downloading">
        <v-spacer />
        <v-btn
          color="error"
          variant="text"
          @click="dialog = false"
        >
          Отказаться
        </v-btn>
        <v-btn
          color="green-darken-1"
          variant="text"
          @click="download()"
        >
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
import { ipcRenderer } from "electron";

const store = useStore();

const dialog = ref(false);
const downloading = ref(false);
const progress = ref(0);

onMounted((): void => {
  dialog.value = !store.state.defaultSetsDownloaded;
  // dialog = true
  store.commit("button_enabled", !dialog.value);
  ipcRenderer.on("download_progress", (_, prog) => {
    progress.value = prog;
  });
});

async function download () {
  downloading.value = true;
  await storageService.downloadAndUnpack("https://linka.su/sets.zip");
  dialog.value = false;
  window.location.reload();
}

function onDialog (v: boolean) {
  store.commit("button_enabled", !v);
  store.commit("defaultSetsDownloaded", !v);
}

watch(dialog, onDialog);
</script>
