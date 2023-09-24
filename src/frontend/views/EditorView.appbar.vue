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
      @saveAs="(title: string) => saveAs(title)"
    />
  </v-app-bar>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useStore } from "vuex";

import SaveButton from "@frontend/components/EditorView/SaveButton.vue";
import ExitButton from "@frontend/components/EditorView/ExitButton.vue";
import SetSettings from "@frontend/components/EditorView/SetSettings.vue";
import NotesButton from "@frontend/components/SetExplorer/NotesButton.vue";

const router = useRouter();
const store = useStore();

const path = computed((): string => {
  return store.state.editor.current;
});

const title = computed(() => {
  const arr = path.value.split("§");
  return arr[arr.length - 1];
});

async function save () {
  await store.dispatch("editor_save");
  router.back();
}

async function saveAs (title: string) {
  const newLink = await store.dispatch("editor_save_as", title);
  router.push("/set/" + newLink);
}
</script>
