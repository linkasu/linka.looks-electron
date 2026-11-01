<template>
  <v-sheet>
    <v-card>
      <v-card-title> Голос озвучки </v-card-title>
      <v-card-text>
        <v-form>
          <v-select
            v-model="voiceRu"
            :items="ruVoices"
            label="Русский голос"
            item-value="value"
            item-title="text"
          />
          <v-btn
            variant="tonal"
            min-height="48"
            :loading="playingLanguage === 'ru'"
            :disabled="isPlayingExample || !voiceRu || !ruVoices.length"
            @click="playExample('ru')"
          >
            Прослушать русский
          </v-btn>

          <v-select
            v-model="voiceEn"
            class="mt-4"
            :items="enVoices"
            label="Английский голос"
            item-value="value"
            item-title="text"
          />
          <v-btn
            variant="tonal"
            min-height="48"
            :loading="playingLanguage === 'en'"
            :disabled="isPlayingExample || !voiceEn || !enVoices.length"
            @click="playExample('en')"
            >Прослушать английский</v-btn
          >
          <p v-if="previewError" role="alert" class="mt-3">{{ previewError }}</p>
        </v-form>
      </v-card-text>
    </v-card>
  </v-sheet>
</template>
<script lang="ts" setup>
import { TTS } from "@/frontend/utils/TTS";
import { computed, ref } from "vue";
import { useStore } from "vuex";

const store = useStore();
const isPlayingExample = ref(false);
const playingLanguage = ref<"ru" | "en">();
const previewError = ref("");

const voices = TTS.voices;

const ruVoices = computed(() => voices.filter((voice) => voice.langCode?.startsWith("ru")));
const enVoices = computed(() => voices.filter((voice) => voice.langCode?.startsWith("en")));

const voiceRu = computed({
  get() {
    return store.state.voiceRu;
  },
  set(value: string) {
    store.dispatch("voiceRu_change", value);
  }
});

const voiceEn = computed({
  get() {
    return store.state.voiceEn;
  },
  set(value: string) {
    store.dispatch("voiceEn_change", value);
  }
});

function playExample(lang: "ru" | "en") {
  if (isPlayingExample.value) return;
  isPlayingExample.value = true;
  playingLanguage.value = lang;
  previewError.value = "";

  const value = lang === "ru" ? voiceRu.value : voiceEn.value;
  const sample = lang === "ru" ? "Привет" : "Hello";
  void TTS.instance
    .playText(sample, value)
    .catch(() => {
      previewError.value = "Не удалось воспроизвести пример. Попробуйте ещё раз.";
    })
    .finally(() => {
      isPlayingExample.value = false;
      playingLanguage.value = undefined;
    });
}
</script>
