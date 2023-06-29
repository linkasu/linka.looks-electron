<template>
  <section>
    <span> Версия приложения: {{ version }}. </span>
    <span v-if="available"> Доступно обновление! Идет загрузка. {{percent}}%. </span>
    <v-layout row justify-center>
      <v-dialog v-model="downloaded" persistent max-width="290">
        <v-card>
          <v-card-title class="headline">Обновление загружено</v-card-title>
          <v-card-text> установить сейчас? </v-card-text>
          <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn color="primary" flat @click.native="downloaded = false"
              >Нет</v-btn
            >
            <v-btn
              color="primary"
              flat
              @click.native="
                downloaded = false;
                update();
              "
              >Да</v-btn
            >
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-layout>
  </section>
</template>

<script lang="ts">
import { ipcRenderer } from "electron";
import { ProgressInfo } from "electron-updater";
import { Vue, prop, Options } from "vue-class-component";

class Props {}

@Options({})
export default class UpdateStatusBar extends Vue.with(Props) {
  percent: number = 0;
  update() {
    ipcRenderer.send("restart_app");
  }
  version = "";
  available = false;
  downloaded = false;
  mounted(): void {
    ipcRenderer.send("app_version");
    ipcRenderer.on("app_version", (event, data) => {
      this.version = data.version;
    });
    ipcRenderer.on("update_info", (event, data: ProgressInfo) => {
      this.percent = data.percent;
    });

    ipcRenderer.on("update_available", () => {
      ipcRenderer.removeAllListeners("update_available");
      this.available = true;
    });

    ipcRenderer.on("update_downloaded", () => {
      ipcRenderer.removeAllListeners("update_downloaded");
      this.available = false;
      this.downloaded = true;
    });
  }
}
</script>
