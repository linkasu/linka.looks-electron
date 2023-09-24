<template>
  <v-dialog
    v-model="dialog"
    width="auto"
  >
    <template #activator="{ props: activator_props }">
      <v-btn
        flat
        icon=""
        v-bind="activator_props"
      >
        <v-icon>mdi-content-save</v-icon>
      </v-btn>
    </template>

    <v-card
      v-if="!saveAsNew"
      min-width="300px"
    >
      <v-card-title primary-title>
        Сохранить {{ title }}?
      </v-card-title>
      <v-card-text> Вы уверены? </v-card-text>
      <v-card-actions>
        <v-btn
          color="error"
          @click="
            emit('save'),
            dialog = false
          "
        >
          Сохранить
        </v-btn>
        <v-btn
          color="error"
          @click="saveAsNew = true"
        >
          Сохранить как новый
        </v-btn>
        <v-btn
          color="primary"
          @click="dialog = false"
        >
          Нет
        </v-btn>
      </v-card-actions>
    </v-card>
    <v-card
      v-else
      min-width="300px"
    >
      <v-card-title primary-title>
        Сохранить как новый?
      </v-card-title>
      <v-card-text>
        <v-text-field
          v-model="newTitle"
          suffix=".linka"
        />
      </v-card-text>
      <v-card-actions>
        <v-btn
          color="error"
          @click="on_save_click"
        >
          Сохранить
        </v-btn>
        <v-btn
          color="primary"
          @click="saveAsNew = false"
        >
          Нет
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { defineProps, defineEmits, ref } from "vue";

const props = defineProps<{ title: string }>();

const emit = defineEmits<{
  (e: "save"): void
  (e: "saveAs", payload: string): void
}>();

const dialog = ref(false);
const saveAsNew = ref(false);
const newTitle = ref(props.title.slice(0, -6));

function on_save_click () {
  if (newTitle.value) { emit("saveAs", newTitle.value + ".linka"); }
  dialog.value = false;
}
</script>
