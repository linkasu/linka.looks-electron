<template>
  <v-app-bar>
    <exit-button @exit="$router.back()" />
    <v-app-bar-title>
      {{ title }}
    </v-app-bar-title>
    <v-spacer />
    <notes-button edit="true" />
    <set-settings />
    <save-button
      :title="title"
      @save="save"
      @saveAs="(title:string)=>saveAs(title)"
    />
  </v-app-bar>
</template>

<script lang="ts">
import { Vue, prop, Options } from "vue-class-component";
import SaveButton from "@frontend/components/EditorView/SaveButton.vue";
import ExitButton from "@frontend/components/EditorView/ExitButton.vue";
import SetSettings from "@frontend/components/EditorView/SetSettings.vue";
import NotesButton from "@frontend/components/SetExplorer/NotesButton.vue";

import { storageService } from "@frontend/CardsStorage/index";

class Props {}

@Options({
  components: {
    ExitButton,
    SaveButton,
    SetSettings,
    NotesButton
  }
})
export default class EditorViewAppBar extends Vue.with(Props) {
  get path (): string {
    return this.$store.state.editor.current;
  }

  get filename (): string | null {
    return this.$store.state.editor.temp;
  }

  get title () {
    const arr = this.path.split("§");
    return arr[arr.length - 1];
  }

  async save () {
    await this.$store.dispatch("editor_save");
    this.$router.back();
  }

  async saveAs (title: string) {
    const newLink = await this.$store.dispatch("editor_save_as", title);
    this.$router.push("/set/" + newLink);
  }
}
</script>
