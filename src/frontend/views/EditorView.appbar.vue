<template>
  <v-app-bar>
    <exit-button @exit="$router.back()" />
    <v-app-bar-title>
      {{ title }}
    </v-app-bar-title>
    <v-spacer />
    <div class="page-indicator">
      {{ page + 1 }} из {{ totalPages }}
    </div>
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
    <save-button
      :title="title"
      :disabled="ui_disabled"
      @save="save"
      @saveAs="(title: string) => saveAs(title)"
    />
  </v-app-bar>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useStore } from "vuex";

import SaveButton from "@/frontend/components/EditorView/SaveButton.vue";
import ExitButton from "@/frontend/components/EditorView/ExitButton.vue";
import SetSettings from "@/frontend/components/EditorView/SetSettings.vue";
import NotesButton from "@/frontend/components/SetExplorer/NotesButton.vue";
import { CardType } from "@/common/interfaces/ConfigFile";

const router = useRouter();
const store = useStore();

const ui_disabled = computed(() => store.state.ui.disabled);
const page = computed(() => store.state.editor.page ?? 0);

const totalPages = computed(() => {
  const columns = store.state.editor.columns;
  const rows = store.state.editor.rows;
  const pageSize = Math.max(1, columns * rows);
  const cards = store.state.editor.cards ?? [];
  for (let i = cards.length - 1; i >= 0; i--) {
    const card = cards[i];
    if (card && card.cardType !== CardType.NewCard) {
      const realCount = i + 1;
      const realPages = Math.ceil(realCount / pageSize);
      return Math.max(realPages, page.value + 1);
    }
  }
  return Math.max(1, page.value + 1);
});

const emptyPage = computed(() => {
  const columns = store.state.editor.columns;
  const rows = store.state.editor.rows;
  const pageSize = Math.max(1, columns * rows);
  const cards = store.state.editor.cards ?? [];
  const start = page.value * pageSize;
  for (let i = 0; i < pageSize; i++) {
    const card = cards[start + i];
    if (card && card.cardType !== CardType.NewCard) return false;
  }
  return true;
});

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

function copyPage () {
  store.dispatch("editor_copy_page");
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
