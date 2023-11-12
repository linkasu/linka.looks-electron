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

const voices = [
  { value: "zahar", text: "Захар" },
  { value: "ermil", text: "Емиль" },
  { value: "jane", text: "Джейн" },
  { value: "oksana", text: "Оксана" },
  { value: "alena", text: "Алёна" },
  { value: "filipp", text: "Филипп" },
  { value: "omazh", text: "Ома" }
];
const dialog = ref(false);
const audioText = ref(props.audioText ?? "");
//const voice = ref(computed(() => store.state.voice));
const voice = ref("alena");

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
</script>
