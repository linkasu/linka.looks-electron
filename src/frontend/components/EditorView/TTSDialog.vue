<template>
  <v-dialog v-model="dialog" max-width="600" :persistent="busy">
    <template #activator="{ props }">
      <v-btn v-bind="props" block class="mb-1" :disabled="ui_disabled">
        Создать озвучку из текста
      </v-btn>
    </template>

    <v-card>
      <v-card-title primary-title> Озвучка из текста </v-card-title>
      <v-card-text>
        <v-form>
          <v-select
            v-model="currentVoice"
            :items="voiceOptions"
            label="Голос"
            item-value="value"
            item-title="text"
            :disabled="busy"
          />

          <v-textarea
            v-model="enteredText"
            label="Текст для озвучки"
            rows="4"
            auto-grow
            :disabled="busy"
          />
          <v-alert v-if="errorMessage" type="error" variant="tonal" role="alert">{{
            errorMessage
          }}</v-alert>
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-btn
          color="primary"
          variant="flat"
          @click="create"
          :loading="operation === 'create'"
          :disabled="!hasText || busy"
        >
          Добавить озвучку
        </v-btn>
        <v-btn @click="dialog = false" :disabled="busy"> Отменить </v-btn>

        <v-spacer />
        <v-btn
          variant="text"
          @click="playExample"
          :loading="operation === 'preview'"
          :disabled="!hasText || busy"
        >
          Прослушать
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { ref, watch, computed, Ref } from "vue";
import { useStore } from "vuex";
import { storageService } from "@/frontend/services/card-storage-service";
import { TTS } from "@/frontend/utils/TTS";

const store = useStore();
const props = defineProps<{ file: string; audioText?: string; audioVoice?: string }>();
const emit = defineEmits<{
  (e: "audio", payload: { audioSrcFile: string; audioText: string; audioVoice: string }): void;
}>();

const ui_disabled = computed(() => store.state.ui.disabled);

const dialog = ref(false);
const operation = ref<"create" | "preview" | null>(null);
const busy = computed(() => operation.value !== null);
const errorMessage = ref("");

const enteredText: Ref<string> = ref("");
const currentAudioText = computed({
  get() {
    return enteredText.value;
  },
  set(v: string) {
    enteredText.value = v;
  }
});

const voiceOptions = TTS.voices;
const voice: Ref<string> = ref("");
const currentVoice = computed({
  get() {
    return voice.value;
  },
  set(v: string) {
    voice.value = v;
  }
});

watch(dialog, onDialog);

async function create() {
  if (busy.value || !hasText.value) return;
  operation.value = "create";
  errorMessage.value = "";
  store.dispatch("disable_ui");
  try {
    const audioSrcFile = await storageService.createAudioFromText(
      props.file,
      currentAudioText.value,
      currentVoice.value
    );
    if (!audioSrcFile) throw new Error("Audio creation returned no file");

    emit("audio", { audioSrcFile, audioText: enteredText.value, audioVoice: voice.value });
    dialog.value = false;
  } catch (error) {
    console.error(error);
    errorMessage.value = "Не удалось создать озвучку. Попробуйте ещё раз.";
  } finally {
    operation.value = null;
    store.dispatch("enable_ui");
  }
}

function onDialog(v: boolean) {
  if (v) {
    errorMessage.value = "";
    currentAudioText.value = props.audioText ?? "";
    currentVoice.value = props.audioVoice ?? TTS.instance.resolveVoice(currentAudioText.value);
  }
}

async function playExample() {
  if (busy.value || !hasText.value) return;
  operation.value = "preview";
  errorMessage.value = "";
  try {
    await TTS.instance.playText(enteredText.value, voice.value);
  } catch (error) {
    console.error(error);
    errorMessage.value = "Не удалось воспроизвести озвучку. Попробуйте ещё раз.";
  } finally {
    operation.value = null;
  }
}

const hasText = computed(() => {
  return enteredText.value.trim() !== "";
});
</script>

<style scoped>
.v-card-actions {
  flex-wrap: wrap;
  gap: 8px;
}
</style>
