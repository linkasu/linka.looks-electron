<template>
  <v-dialog
    v-model="dialog"
    width="auto"
  >
    <template #activator="{ props }">
      <v-btn
        v-bind="props"
        block
        class="mb-1"
        :disabled="ui_disabled"
      >
        Cоздать из текста
      </v-btn>
    </template>

    <v-card min-width="300px">
      <v-card-title primary-title>
        Введите текст
      </v-card-title>
      <v-card-text>
        <v-form>
          <v-select
            v-model="voice"
            :items="voices"
            label="Голос"
            item-value="value"
            item-title="text"
          />

          <v-text-field
            v-model="audioText"
            label="Текст для озвучки"
          />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-btn
          color="primary"
          @click="create"
          :disabled="!hasText"
        >
          Создать
        </v-btn>
        <v-btn
          color="primary"
          @click="dialog = false"
        >
          Отмена
        </v-btn>

        <v-spacer />
        <v-btn
          color="success"
          @click="playExample"
          :disabled="!hasText"
        >
          Послушать результат
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { ref, watch, defineProps, defineEmits, computed } from "vue";
import { useStore } from "vuex";
import { storageService } from "@/frontend/services/card-storage-service";
import { TTS } from "@/frontend/utils/TTS";

const store = useStore();
const props = defineProps<{ file: string, audioText?: string }>();
const emit = defineEmits<{(e: "audio", payload: { audioSrcFile: string, audioText: string }): void }>();

const ui_disabled = computed(() => store.state.ui.disabled);

const voices = TTS.voices;

const dialog = ref(false);
const audioText = ref(props.audioText ?? "");
const defaultVoice = computed(() => store.state.voice);
const voice = ref(defaultVoice.value);

watch(dialog, onDialog);

function create () {
  store.dispatch("disable_ui");
  storageService.createAudioFromText(props.file, audioText.value, voice.value).then((audioSrcFile: string) => {
    emit("audio", { audioSrcFile, audioText: audioText.value });
    store.dispatch("enable_ui");
    dialog.value = false;
  });
}

function onDialog (v: boolean) {
  if (!v) {
    audioText.value = "";
  }
}

function playExample () {
  TTS.instance.playText(audioText.value, voice.value);
}

const hasText = computed(() => {
  return audioText.value.trim() !== "";
});
</script>
