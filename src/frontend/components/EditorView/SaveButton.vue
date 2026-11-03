<template>
  <v-btn color="primary" variant="flat" :disabled="disabled" @click="emit('save')">
    Сохранить
  </v-btn>
  <v-menu>
    <template #activator="{ props: menuProps }">
      <v-btn v-bind="menuProps" :disabled="disabled" aria-label="Другие действия сохранения">
        Ещё <v-icon end>mdi-chevron-down</v-icon>
      </v-btn>
    </template>
    <v-list role="menu">
      <v-list-item role="menuitem" :disabled="disabled" @click="emit('saveAndExit')"
        >Сохранить и выйти</v-list-item
      >
      <v-list-item role="menuitem" :disabled="disabled" @click="dialog = true"
        >Сохранить копию</v-list-item
      >
    </v-list>
  </v-menu>
  <v-dialog v-model="dialog" max-width="480">
    <v-card>
      <v-card-title primary-title> Сохранить как новый? </v-card-title>
      <v-card-text>
        <v-text-field
          v-model="newTitle"
          @update:model-value="nameEdited = true"
          label="Название копии"
          suffix=".linka"
          :rules="[isValid]"
        />
        <div v-if="suggestionError" role="alert">
          Не удалось предложить имя копии
          <v-btn :disabled="disabled || suggesting" @click="suggestCopyName">Повторить</v-btn>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="disabled || suggesting || (suggestionError && !nameEdited)"
          @click="on_save_click"
        >
          Сохранить копию и выйти
        </v-btn>
        <v-btn @click="dialog = false"> Продолжить редактирование </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { ref, watch } from "vue";
import { validateStorageName } from "@/common/utils/storageName";
import { storageService } from "@/frontend/services/card-storage-service";

const props = defineProps<{ path: string; disabled?: boolean }>();

const emit = defineEmits<{
  (e: "save"): void;
  (e: "saveAndExit"): void;
  (e: "saveAs", payload: string): void;
}>();

const dialog = ref(false);
const newTitle = ref("");
const nameEdited = ref(false);
const suggesting = ref(false);
const suggestionError = ref(false);
let suggestionRequest = 0;

watch([dialog, () => props.path], () => {
  suggestionRequest++;
  if (!dialog.value) return;
  newTitle.value = "";
  nameEdited.value = false;
  void suggestCopyName();
});

async function suggestCopyName() {
  const request = ++suggestionRequest;
  suggesting.value = true;
  suggestionError.value = false;
  try {
    const name = await storageService.getSuggestedCopyName(props.path);
    if (request !== suggestionRequest || !dialog.value) return;
    if (!nameEdited.value) newTitle.value = name.slice(0, -6);
  } catch {
    if (request === suggestionRequest) suggestionError.value = true;
  } finally {
    if (request === suggestionRequest) suggesting.value = false;
  }
}

function on_save_click() {
  if (props.disabled || suggesting.value || (suggestionError.value && !nameEdited.value)) return;
  if (isValid(newTitle.value) !== true) return;
  if (newTitle.value) {
    emit("saveAs", newTitle.value + ".linka");
  }
  dialog.value = false;
}

function isValid(text: string) {
  return validateStorageName(text ? text + ".linka" : text);
}
</script>

<style scoped>
.v-card-actions {
  flex-wrap: wrap;
  gap: 8px;
}
.v-card-actions :deep(.v-btn__content) {
  white-space: normal;
}
.v-card-title {
  white-space: normal;
  overflow-wrap: anywhere;
}
</style>
