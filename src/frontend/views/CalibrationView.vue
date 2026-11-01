<template>
  <div class="content">
    <v-container grid-list-xs>
      <v-card>
        <v-card-title primary-title> Настройка масштаба экрана </v-card-title>
        <v-card-text>
          Эта настройка помогает согласовать положение взгляда с масштабом экрана. Она не заменяет
          калибровку Tobii.
          <br />
          Используйте переключатель ниже и проверьте выбор по кнопкам с мишенями. Выбор и реакция
          должны совпадать.
        </v-card-text>
        <v-card-text>
          <v-checkbox v-model="multiplyScale" label="Учитывать масштабирование экрана"></v-checkbox>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn min-height="48" variant="tonal" @click="finishCalibration">Готово</v-btn>
        </v-card-actions>
      </v-card>
    </v-container>
    <div class="corner">
      <eye-button class="button" v-for="i in 4" :key="i" :aria-label="`Проверочная мишень ${i}`"
        ><span aria-hidden="true" class="fixation-point">⊙</span></eye-button
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import EyeButton from "../components/EyeButton.vue";
import store from "../store";

const router = useRouter();

const multiplyScale = computed({
  get() {
    return store.state.button.multiplyScale;
  },
  set(v) {
    store.commit("button_multiply_scale", v);
  }
});

function finishCalibration() {
  store.commit("first_calibrate", true);
  router.push("/");
}
</script>

<style scoped>
.content {
  width: 100%;
  height: 100%;
}

.corner {
  width: 50vh;
  height: 50vh;
  bottom: 40px;
  right: 0;
  position: absolute;
  display: grid;
  grid-template-rows: 1fr 1fr;
  grid-template-columns: 1fr 1fr;
}
.button {
  display: block;
  width: auto;
}
.fixation-point {
  font-size: 48px;
}
</style>
