<template>
  <v-app-bar>
    <v-btn flat icon @click="back">
      <v-icon>mdi-arrow-left</v-icon>
    </v-btn>
    <v-app-bar-title>
      {{  title }}
    </v-app-bar-title>
    <v-spacer />
    <notes-button
    v-if="config?.description"
    :config="config"
    />
    <v-btn
      flat
      icon
      :color="interfaceOutputLine ? 'primary' : ''"
      @click="switchInterfaceOutputLine"
      :title="(interfaceOutputLine ? 'Скрыть' : 'Показать') + ' строку вывода'"
    >
      <v-icon>mdi-form-textbox</v-icon>
    </v-btn>
    <v-btn
      flat
      icon
      :color="buttonEnabled ? 'primary' : ''"
      @click="switchButtonEnabled"
      :title="
        (buttonEnabled ? 'Выключить' : 'Включить') + ' управление глазами'
      "
    >
      <v-icon>{{ buttonEnabled ? "mdi-eye" : "mdi-eye-off" }}</v-icon>
    </v-btn>
    <v-btn
      flat
      :color="animationEnabled ? 'primary' : ''"
      @click="switchAnimationEnabled"
      :title="
        (animationEnabled ? 'Выключить' : 'Включить') + ' анимацию'
      "
    >
    </v-btn>
    <v-spacer />
    <share-button/>
    <v-btn flat icon :to="editLink">
      <v-icon>mdi-pencil</v-icon>
    </v-btn>
    <folder-button :file="file" @move="move"/>
    <delete-button :file="title" @delete="del" />
  </v-app-bar>
</template>

<script lang="ts">
import { Options, Vue } from "vue-class-component";
import DeleteButton from "@/components/SetExplorer/DeleteButton.vue";
import FolderButton from "@/components/SetExplorer/FolderButton.vue";
import NotesButton from "@/components/SetExplorer/NotesButton.vue";
import { storageService } from "@/CardsStorage/frontend";
import ShareButton from "@/components/ShareButton.vue";
import { Metric } from "@/utils/Metric";
import { basename } from "path";
import { HOME_DIR } from "@/CardsStorage/constants";

@Options({
  components: {
    DeleteButton,
    FolderButton,
    NotesButton,
    ShareButton
  }
})
export default class SetExplorerViewAppBar extends Vue {
  get config () {
    return this.$store.state.explorer.config;
  }

  get file (): string {
    return this.$route.params.path.toString();
  }

  back () {
    if (this.file.includes(":")) {
      this.$router.push("/");
      return;
    }
    this.$router.push("/" + this.file.split("§").slice(0, -1).join("§"));
  }

  get title () {
    const arr = this.file.split("§");
    return basename(arr[arr.length - 1]);
  }

  get editLink () {
    return this.$route.fullPath.replace("set", "edit");
  }

  get interfaceOutputLine () {
    return this.$store.state.ui.outputLine;
  }

  switchInterfaceOutputLine () {
    this.$store.dispatch("interface_outputLine");
  }

  get buttonEnabled () {
    return this.$store.state.button.enabled;
  }

  switchButtonEnabled () {
    this.$store.dispatch("button_enabled");
  }
  get animationEnabled() {
    return this.$store.state.animation.enabled;
  }
  switchAnimationEnabled() {
    this.$store.dispatch("animation_enabled");
  }

  async del () {
    await storageService.moveToTrash(this.file);
    this.back();
    Metric.registerEvent("trash");
  }

  async move (location: string) {
    const target = await storageService.moveSet(this.file, location);
    const url = target.slice(target.lastIndexOf("LINKa") + 5).replaceAll("/", "§").replace("\\", "§");

    this.$router.push("/set/" + url);
    Metric.registerEvent("move");
  }
}
</script>
