<template>
  <v-dialog v-model="dialog" width="auto">
    <template #activator="{ props }">
      <v-btn v-bind="props" block class="mb-1" :disabled="ui_disabled"> Cоздать из текста </v-btn>
    </template>

    <v-card min-width="300px">
      <v-card-title primary-title> Введите текст </v-card-title>
      <v-card-text>
        <v-form>
          <v-select
            v-model="currentVoice"
            :items="voiceOptions"
            label="Голос"
            item-value="value"
            item-title="text"
          />

          <v-text-field v-model="audioText" label="Текст для озвучки" />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-btn color="primary" @click="create" :disabled="!hasText"> Создать </v-btn>
        <v-btn color="primary" @click="dialog = false"> Отмена </v-btn>

        <v-spacer />
        <v-btn color="success" @click="playExample" :disabled="!hasText">
          Послушать результат
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

const audioText: Ref<string> = ref("");
const currentAudioText = computed({
  get() {
    return audioText.value;
  },
  set(v: string) {
    audioText.value = v;
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
  store.dispatch("disable_ui");
  try {
    const audioSrcFile = await storageService.createAudioFromText(
      props.file,
      currentAudioText.value,
      currentVoice.value
    );
    if (!audioSrcFile) return;

    emit("audio", { audioSrcFile, audioText: audioText.value, audioVoice: voice.value });
    dialog.value = false;
  } catch (error) {
    console.error(error);
  } finally {
    store.dispatch("enable_ui");
  }
}

function onDialog(v: boolean) {
  if (v) {
    currentAudioText.value = props.audioText ?? "";
    currentVoice.value = props.audioVoice ?? TTS.instance.resolveVoice(currentAudioText.value);
  }
}

function playExample() {
  TTS.instance.playText(audioText.value, voice.value);
}

const hasText = computed(() => {
  return audioText.value.trim() !== "";
});
</script>
