<template>
  <v-dialog v-model="dialog" width="auto">
    <template v-slot:activator="{ props }">
      <v-btn title="Заметки о наборе" flat icon="" v-bind="props">
        <v-icon>mdi-note-text</v-icon>
      </v-btn>
    </template>

    <v-card min-width="600px" min-height="200px">
      <v-card-title primary-title> Заметки к набору </v-card-title>
      <v-card-text v-if="!edit">
        <pre>{{ description }} </pre>
      </v-card-text>
      <v-card-text v-else>
        <v-textarea v-model="description" multi-line></v-textarea>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn color="primary" @click="dialog = false"> Закрыть </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
import { ConfigFile } from "@/interfaces/ConfigFile";
import { Vue, prop, Options } from "vue-class-component";

class Props {
  config = prop<ConfigFile>({
    required: true
  });

  edit = prop({
    default: false
  });
}

@Options({
  watch: {
    dialog: "onDialog"
  }
})
export default class NotesButton extends Vue.with(Props) {
  dialog = false;
  get description () {
    return this.edit
      ? this.$store.state.editor.description
      : this.config.description;
  }

  set description (text: string | undefined) {
    this.$store.commit("editor_description", text);
  }

  onDialog (value: boolean) {
    this.$store.commit("button_enabled", !this.dialog);
  }
}
</script>
