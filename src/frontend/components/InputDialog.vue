<template>
  <v-dialog v-model="dialog" max-width="480" @show="dialog = true">
    <template v-if="buttonText || icon" #activator="{ props }">
      <v-btn
        v-bind="props"
        :block="!!!icon"
        :icon="icon"
        :flat="!!icon"
        :title="title"
        :disabled="disabled"
        :aria-label="buttonText || title"
      >
        {{ buttonText }}
        <v-icon v-if="icon">
          {{ icon }}
        </v-icon>
      </v-btn>
    </template>

    <v-card>
      <v-card-title primary-title>
        {{ title }}
      </v-card-title>
      <v-card-text>
        <v-form @submit.prevent="submit()">
          <v-text-field v-model="text" :label="label" :rules="[isValid]" />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="disabled || isValid(text) !== true"
          @click="submit()"
        >
          {{ confirmText }}
        </v-btn>
        <v-btn v-if="cancelText" @click="dialog = false">
          {{ cancelText }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { ref, watch } from "vue";
import { validateStorageName } from "@/common/utils/storageName";

interface IInputDialogProps {
  title: string;
  label: string;
  confirmText: string;
  show?: boolean;
  checkFilePath?: boolean;
  buttonText?: string;
  icon?: string;
  cancelText?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<IInputDialogProps>(), {
  checkFilePath: false,
  show: false
});

const emit = defineEmits<{ (e: "confirm", payload: string): void; (e: "cancel"): void }>();

const dialog = ref(false);
const noCancel = ref(false);
const text = ref("");

watch(dialog, onDialog);
watch(
  () => props.show,
  (newVal) => (dialog.value = newVal)
);

function onDialog(v: boolean) {
  if (!v) {
    if (!noCancel.value) emit("cancel");
    noCancel.value = false;

    text.value = "";
  }
}

async function submit() {
  if (props.disabled || isValid(text.value) !== true) {
    return;
  }
  noCancel.value = true;

  emit("confirm", text.value);

  dialog.value = false;
}

function isValid(text: string) {
  if (!props.checkFilePath) return !!text.trim() || "Введите текст";
  return validateStorageName(text);
}
</script>
