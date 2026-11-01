<template>
  <v-app-bar>
    <exit-button :disabled="ui_disabled" :confirm="hasChanges" @exit="$router.back()" />
    <v-app-bar-title>
      {{ title }}
    </v-app-bar-title>
    <v-spacer />
    <notes-button edit />
    <set-settings />
    <save-button
      :title="title"
      :disabled="ui_disabled"
      @save="save"
      @saveAndExit="save(true)"
      @saveAs="(title: string) => saveAs(title)"
    />
    <v-snackbar v-model="saveError" :timeout="5000">
      Не удалось сохранить набор
      <template #actions>
        <v-btn variant="text" @click="saveError = false"> Закрыть </v-btn>
      </template>
    </v-snackbar>
    <v-snackbar v-model="saveSuccess" :timeout="savedWithChanges ? 5000 : 2500" role="status">
      {{
        savedWithChanges
          ? "Есть новые несохранённые изменения. Сохраните их перед выходом."
          : "Набор сохранён"
      }}
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

const router = useRouter();
const store = useStore();
const saveError = ref(false);
const saveSuccess = ref(false);
const savedWithChanges = ref(false);

const saving = ref(false);
const ui_disabled = computed(() => store.state.ui.disabled || saving.value);
const hasChanges = computed(() => store.getters.editor_hasChanges);

const path = computed((): string => {
  return store.state.editor.current;
});

const title = computed(() => {
  const arr = path.value.split("§");
  return arr[arr.length - 1];
});

async function save(exit = false) {
  if (ui_disabled.value) return;
  saving.value = true;
  saveError.value = false;
  saveSuccess.value = false;
  try {
    await store.dispatch("editor_save");
    savedWithChanges.value = hasChanges.value;
    if (exit && !savedWithChanges.value) router.back();
    else saveSuccess.value = true;
  } catch (error) {
    console.error(error);
    saveError.value = true;
  } finally {
    saving.value = false;
  }
}

async function saveAs(title: string) {
  if (ui_disabled.value) return;
  saving.value = true;
  saveError.value = false;
  saveSuccess.value = false;
  try {
    const newLink = await store.dispatch("editor_save_as", title);
    savedWithChanges.value = hasChanges.value;
    if (savedWithChanges.value) saveSuccess.value = true;
    else router.push("/set/" + newLink);
  } catch (error) {
    console.error(error);
    saveError.value = true;
  } finally {
    saving.value = false;
  }
}
</script>
