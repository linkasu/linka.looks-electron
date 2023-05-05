<template>
  <v-dialog v-model="dialog" width="auto">
    <template v-slot:activator="{ props }">
      <v-btn flat icon="" v-bind="props">
        <v-icon>mdi-folder-remove</v-icon>
      </v-btn>
    </template>

    <v-card min-width="300px">
      <v-card-title primary-title>
        Какую папку вы хотите удалить?
      </v-card-title>
      <v-card-text>
        <v-select
          v-if="directories"
          :items="titles"
          v-model="directory"
          label="Папка"
        ></v-select>
      </v-card-text>
      <v-card-actions>
        <v-btn
          color="primary"
          @click="
            remove();
            dialog = false;
          "
          >Удалить</v-btn
        >
        <v-btn color="primary" @click="dialog = false">Отмена</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
import { storageService } from "@/CardsStorage/frontend";
import { DirectoryFile } from "@/interfaces/Directory";
import { Vue, prop, Options } from "vue-class-component";

class Props {}

@Options({
  watch: {
    dialog: "onDialog",
  },
})
export default class ExitButton extends Vue.with(Props) {
  dialog = false;
  directories?: DirectoryFile[] | null = null;
  directory?: string | null = null;
  get titles() {
    return this.directories?.map(({ file }) => {
      return file.split("/").slice(-1)[0];
    });
  }
  get root(){
    return this.$route.params.path.toString()
  }
  onDialog(value: boolean) {
    if (value) {
      this.load();
    }
  }
  async load() {
    this.directories = (
      await storageService.getFiles(this.root)
    )?.filter(({ directory }) => directory);
    if (this.titles) this.directory = this.titles[0];
  }

  async remove() {
    await storageService.rmdir(this.root+'§'+this.directory)
    setTimeout(() => {
        window.location.reload()
    }, 100);
  }
}
</script>
