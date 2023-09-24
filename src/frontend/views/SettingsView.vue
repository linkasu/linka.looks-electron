<template>
  <v-container>
    <v-row>
      <v-col
        cols="12"
        md="8"
      >
        <v-card>
          <v-card-title primary-title>
            Главные настройки
          </v-card-title>
          <v-card-text>
            <v-container>
              <v-checkbox
                v-model="isExitButton"
                label="Кнопка выхода из набора глазами"
              />
            </v-container>
            <v-container>
              <v-row>
                <v-col xs="6">
                  <v-checkbox
                    v-model="eyeSelect"
                    label="Выбор карточки глазами"
                  />
                </v-col>
                <v-col xs="6">
                  <v-checkbox
                    v-model="eyeActivation"
                    label="Активация карточки глазами"
                  />
                </v-col>
              </v-row>
              <v-row>
                <v-col xs="6">
                  <v-checkbox
                    v-model="joystickActivation"
                    label="Активация карточки джойстиком"
                  />
                </v-col>
                <v-col xs="6">
                  <v-checkbox
                    v-model="keyboardActivation"
                    label="Активация карточки клавиатурой"
                  />
                </v-col>
              </v-row>
              <v-row>
                <v-col xs="6">
                  <v-checkbox
                    v-model="mouseActivation"
                    label="Активация карточки мышкой"
                  />
                </v-col>
                <v-col xs="6">
                  <v-checkbox
                    v-model="clickSound"
                    label="Звук щелчка при активации кнопки"
                  />
                </v-col>
              </v-row>
              <v-row>
                <v-col xs="6">
                  <v-checkbox
                    v-model="animation"
                    label="Анимация изображений"
                  />
                </v-col>
              </v-row>
            </v-container>
            <v-slider
              v-if="eyeActivation"
              v-model="timeout"
              type="number"
              :label="`Время задержки взгляда для активации в секундах: ${timeout}`"
              min="0.1"
              max="5"
              step="0.1"
            />
          </v-card-text>
        </v-card>
      </v-col>

      <v-col
        cols="12"
        md="4"
      >
        <color-settings />
      </v-col>
    </v-row>
    <v-row>
      <v-col
        cols="12"
        md="12"
      >
        <input-settings />
      </v-col>
    </v-row>
  </v-container>
</template>

<script lang="ts" setup>
import { ref, computed } from "vue";
import { useStore } from "vuex";

import ColorSettings from "@frontend/components/Settings/ColorsSettings.vue";
import InputSettings from "@frontend/components/Settings/InputSettings.vue";
import { Metric } from "@frontend/utils/Metric";

const store = useStore();

Metric.registerEvent(store.state.pcHash, "openSettings");

const timeout = computed({
  get () {
    return store.state.button.timeout / 1000;
  },
  set (value: number) {
    store.commit("button_timeout", value * 1000);
  }
});

const eyeSelect = computed({
  get () {
    return store.state.button.eyeSelect;
  },
  set (value: boolean) {
    store.commit("button_eyeSelect", value);
  }
});

const clickSound = computed({
  get () {
    return store.state.button.clickSound;
  },
  set (value: boolean) {
    store.commit("button_clickSound", value);
  }
});

const eyeActivation = computed({
  get () {
    return store.state.button.eyeActivation;
  },
  set (value: boolean) {
    store.commit("button_eyeActivation", value);
  }
});

const joystickActivation = computed({
  get () {
    return store.state.button.joystickActivation;
  },
  set (value: boolean) {
    store.commit("button_joystickActivation", value);
  }
});

const keyboardActivation = computed({
  get () {
    return store.state.button.keyboardActivation;
  },
  set (value: boolean) {
    store.commit("button_keyboardActivation", value);
  }
});

const mouseActivation = computed({
  get () {
    return store.state.button.mouseActivation;
  },
  set (value: boolean) {
    store.commit("button_mouseActivation", value);
  }
});

const animation = computed({
  get () {
    return store.state.button.animation;
  },
  set (value: boolean) {
    store.dispatch("button_animation");
  }
});

const isExitButton = computed({
  get () {
    return store.state.ui.exitButton;
  },
  set (value: boolean) {
    store.commit("ui_exitButton", value);
  }
});

const enabled = computed({
  get () {
    return store.state.button.enabled;
  },
  set (value: boolean) {
    store.commit("button_enabled", value);
  }
});
</script>
