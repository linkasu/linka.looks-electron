<template>
  <v-sheet>
    <v-card>
      <v-card-title> Голос озвучки </v-card-title>
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
import { computed, ref } from "vue";
import { useStore } from "vuex";

const store = useStore();
const isPlayingExample = ref(false);

const voices = TTS.voices;

const voice = computed({
  get () {
    return store.state.voice;
  },
  set (value: string) {
    store.dispatch("voice_change", value);
  }
});

function playExample () {
  if (isPlayingExample.value) return;
  isPlayingExample.value = true;
  const selected = voices.find((v) => v.value === voice.value);
  if (!selected) return;
  TTS.instance.playText(selected.text, selected.value).finally(() => {
    isPlayingExample.value = false;
  });
}
</script>
