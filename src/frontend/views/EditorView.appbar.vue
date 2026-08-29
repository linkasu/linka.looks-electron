<template>
  <v-app-bar>
    <exit-button @exit="$router.back()" />
    <v-app-bar-title>
      {{ title }}
    </v-app-bar-title>
    <v-spacer />
    <div class="page-indicator">{{ page + 1 }} из {{ totalPages }}</div>
    <v-spacer />
    <notes-button edit />
    <set-settings />
    <v-btn
      flat
      icon
      title="Копировать страницу"
      :disabled="ui_disabled || emptyPage"
      @click="copyPage"
    >
      <v-icon>mdi-content-copy</v-icon>
    </v-btn>
    <v-btn flat icon title="Удалить страницу" :disabled="ui_disabled" @click="deletePage">
      <v-icon>mdi-delete-outline</v-icon>
    </v-btn>
    <save-button
      :title="title"
      :disabled="ui_disabled"
      @save="save"
      @saveAs="(title: string) => saveAs(title)"
    />
    <v-snackbar v-model="saveError" :timeout="5000">
      Не удалось сохранить набор
      <template #actions>
        <v-btn color="blue" variant="text" @click="saveError = false"> Закрыть </v-btn>
      </template>
    </v-snackbar>
  </v-app-bar>
</template>

<script lang="ts" setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useStore } from "vuex";

import SaveButton from "@/frontend/components/EditorView/SaveButton.vue";
import ExitButton from "@/frontend/components/EditorView/ExitButton.vue";
import SetSettings from "@/frontend/components/EditorView/SetSettings.vue";
import NotesButton from "@/frontend/components/SetExplorer/NotesButton.vue";
import { CardType } from "@/common/interfaces/ConfigFile";

const router = useRouter();
const store = useStore();
const saveError = ref(false);

const ui_disabled = computed(() => store.state.ui.disabled);
const page = computed(() => store.state.editor.page ?? 0);

const totalPages = computed(() => {
  return Math.max(1, store.state.editor.pages?.length ?? 0);
});

const emptyPage = computed(() => {
  const currentPage = store.state.editor.pages?.[page.value];
  return (
    currentPage?.cards?.every((card) =>
      [CardType.NewCard, CardType.EmptyCard].includes(card.cardType)
    ) ?? true
  );
});

const path = computed((): string => {
  return store.state.editor.current;
});

const title = computed(() => {
  const arr = path.value.split("§");
  return arr[arr.length - 1];
});

async function save() {
  try {
    await store.dispatch("editor_save");
    router.back();
  } catch (error) {
    console.error(error);
    saveError.value = true;
  }
}

async function saveAs(title: string) {
  try {
    const newLink = await store.dispatch("editor_save_as", title);
    router.push("/set/" + newLink);
  } catch (error) {
    console.error(error);
    saveError.value = true;
  }
}

function copyPage() {
  store.dispatch("editor_copy_page");
}

function deletePage() {
  store.dispatch("editor_delete_page");
}
</script>

<style scoped>
.page-indicator {
  padding: 2px 10px;
  border: 1px solid black;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.9);
  font-weight: 600;
  white-space: nowrap;
}
</style>
