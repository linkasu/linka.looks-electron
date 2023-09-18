<template>
  <v-dialog v-model="dialog" width="auto" @show="dialog = true">
    <template v-slot:activator="{ props }" v-if="buttonText || icon">
      <v-btn v-bind="props" :block="!!!icon" :icon="icon" :flat="!!icon">
        {{ buttonText }} <v-icon v-if="icon">{{ icon }}</v-icon></v-btn
      >
    </template>

    <v-card min-width="300px">
      <v-card-title primary-title> {{ title }} </v-card-title>
      <v-card-text>
        <v-form @submit.prevent="submit()">
          <v-text-field
            :label="label"
            v-model="text"
            :rules="[isValid]"
          ></v-text-field>
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-btn color="primary" @click="submit()">
          {{ confirmText }}
        </v-btn>
        <v-btn color="primary" @click="dialog = false" v-if="cancelText">
          {{ cancelText }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { ref, watch } from "vue";
import isValidPath from "is-valid-path";

interface IInputDialogProps {
  title: string;
  label: string;
  confirmText: string;
  checkFilePath: boolean;
  buttonText?: string;
  icon?: string;
  cancelText?: string;
}

const props = withDefaults(defineProps<IInputDialogProps>(), {
  checkFilePath: false
})

const emit = defineEmits<{
  (e: "confirm", payload: string): void,
  (e: "cancel"): void,
}>();

const dialog = ref(false);
const noCancel = ref(false);
const text = ref("");

function onDialog (v: boolean) {
  if (!v) {
    if (!noCancel.value) emit("cancel");
    noCancel.value = false;

    text.value = "";
  }
}

function show () {
  dialog.value = true;
}

async function submit () {
  if (isValid(text.value) !== true) {
    return;
  }
  noCancel.value = true;

  emit("confirm", text.value);

  dialog.value = false;
}

function isValid (text: string) {
  if (!props.checkFilePath) return true;
  if (text.includes("/") || !isValidPath(text)) {
    return "Название содержит спецсимволы";
  }
  return true;
}

watch(
  dialog,
  onDialog
)
</script>
