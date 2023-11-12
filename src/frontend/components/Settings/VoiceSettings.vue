<template>
    <v-sheet>
      <v-card>
        <v-card-title> Настройки озвучки </v-card-title>
        <v-card-text>
            <v-form>
                <v-select
                  v-model="voice"
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
  //let isPlayingExample = false;

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
      store.dispatch("voice_change", value);
    }
  });

  /*function isDisabled () {
    return isPlayingExample;
  }*/
  
  function playExample () {
    //isPlayingExample = true;
    const selected = voices.find((v) => v.value === voice.value);
    if (!selected) return;
    TTS.instance.playText(selected.text, selected.value) //.finally(()=> isPlayingExample=false);
  };
  </script>
  