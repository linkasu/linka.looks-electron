<template>
  <v-app-bar>
    <v-btn flat icon @click="back">
      <v-icon>mdi-arrow-left</v-icon>
    </v-btn>
    <v-app-bar-title>
      {{ title }}
    </v-app-bar-title>
    <v-spacer />

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
        (buttonEnabled ? 'Выключить' : 'Включиить') + ' управление глазами'
      "
    >
      <v-icon>{{ buttonEnabled ? "mdi-eye" : "mdi-eye-off" }}</v-icon>
    </v-btn>
    <v-spacer />
    <v-btn flat icon :to="editLink">
      <v-icon>mdi-pencil</v-icon>
    </v-btn>
    <delete-button :file="title" @delete="del" />
  </v-app-bar>
</template>

<script lang="ts">
import { Options, Vue } from "vue-class-component";
import DeleteButton from "@/components/SetExplorer/DeleteButton.vue";
import { storageService } from "@/CardsStorage/frontend";

@Options({
  components: {
    DeleteButton,
  },
})
export default class SetExplorerViewAppBar extends Vue {
  get file(): string {
    return this.$route.params.path.toString();
  }
  back() {
    this.$router.push("/" + this.file.split("§").slice(0, -1).join("§"));
  }
  get title() {
    const arr = this.file.split("§");
    return arr[arr.length - 1];
  }
  get editLink() {
    return this.$route.fullPath.replace("set", "edit");
  }
  get interfaceOutputLine() {
    return this.$store.getters.interface_outputLine;
  }
  switchInterfaceOutputLine() {
    this.$store.dispatch("interface_outputLine");
  }
  get buttonEnabled() {
    return this.$store.getters.button_enabled;
  }
  switchButtonEnabled() {
    this.$store.dispatch("button_enabled");
  }

  async del() {
    await storageService.moveToTrash(this.file);
    this.back();
  }
}
</script>
