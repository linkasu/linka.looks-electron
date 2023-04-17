<template>
  <v-app-bar>
    <exit-button @exit="$router.back()"/>
    <v-app-bar-title>
      {{ title }}
    </v-app-bar-title>
    <v-spacer />
    <v-btn icon>
      <save-button :title="title" @save="save" />
    </v-btn>
  </v-app-bar>
</template>

<script lang="ts">
import { Vue, prop, Options } from "vue-class-component";
import SaveButton from "@/components/EditorView/SaveButton.vue";
import ExitButton from "@/components/EditorView/ExitButton.vue";
import { storageService } from "@/CardsStorage/frontend";

class Props {}

@Options({
  components: {
    ExitButton,
    SaveButton,
  },
})
export default class EditorViewAppBar extends Vue.with(Props) {
  get path(): string {
    return this.$store.getters.editor_current;
  }
  get filename(): string | null {
    return this.$store.getters.editor_temp;
  }

  get title() {
    const arr = this.path.split("§");
    return arr[arr.length - 1];
  }
  async save() {
    await this.$store.dispatch("editor_save");
    this.$router.back();
  }
}
</script>
