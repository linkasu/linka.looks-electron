<template>
    <v-sheet>
      <v-card>
        <v-card-title> Настройки озвучки </v-card-title>
        <v-card-text>
            <v-form>
                <v-select
                  v-model="voiceOption"
                  :items="voices"
                  label="Голос"
                  item-value="value"
                  item-title="text"
                  
                />
                <v-btn
                  color="success"
                  @click="playExample"
                >
                  Прослушать
                </v-btn>
            </v-form>
        </v-card-text>
      </v-card>
    </v-sheet>
  </template>
  <script lang="ts" setup>
  import { TTS } from "@/frontend/utils/TTS";
import { Ref, computed, ref } from "vue";
  import { useStore } from "vuex";
  
  const store = useStore();

  const voices = [
  { value: "zahar", text: "Захар" },
  { value: "ermil", text: "Емиль" },
  { value: "jane", text: "Джейн" },
  { value: "oksana", text: "Оксана" },
  { value: "alena", text: "Алёна" },
  { value: "filipp", text: "Филипп" },
  { value: "omazh", text: "Ома" }
];
  
  const voice = computed({
    get () {
      return store.state.voice;
    },
    set (value: string) {
      store.commit("voice", value);
    }
  });

  const defaultVoice = voices.find((v) => v.value === voice.value) || { value: "alena", text: "Алёна" };
  const voiceOption: Ref<string | null> = ref(defaultVoice.value);

  
  function selectColor (e) {
    console.log(e.target.value);
  }
  
  function playExample () {
    const selected = voices.find((v) => v.value === voice.value);
    console.log(voices, voice)
    if (!selected) return;
    TTS.instance.playText(selected.text, selected.value);
  };
  </script>
  