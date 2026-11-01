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
          label="Название копии"
          suffix=".linka"
          :rules="[isValid]"
        />
      </v-card-text>
      <v-card-actions>
        <v-btn color="primary" variant="flat" :disabled="disabled" @click="on_save_click">
          Сохранить копию и выйти
        </v-btn>
        <v-btn @click="dialog = false"> Продолжить редактирование </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { ref } from "vue";
import { validateStorageName } from "@/common/utils/storageName";

const props = defineProps<{ title: string; disabled?: boolean }>();

const emit = defineEmits<{
  (e: "save"): void;
  (e: "saveAndExit"): void;
  (e: "saveAs", payload: string): void;
}>();

const dialog = ref(false);
const newTitle = ref(props.title.slice(0, -6));

function on_save_click() {
  if (props.disabled) return;
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
