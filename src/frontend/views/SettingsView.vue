<template>
  <v-container
    fluid
    class="py-2"
  >
    <v-row dense>
      <v-col
        cols="12"
        lg="8"
      >
        <v-card density="compact">
          <v-card-title class="text-subtitle-1 py-2">
            Главные настройки
          </v-card-title>
          <v-card-text class="py-2">
            <v-row dense>
              <v-col
                cols="12"
                sm="6"
              >
                <v-btn
                  block
                  density="comfortable"
                  to="/calibration"
                >
                  Калибровка смещения
                </v-btn>
              </v-col>
              <v-col
                cols="12"
                sm="6"
              >
                <v-btn
                  block
                  color="primary"
                  density="comfortable"
                  to="/tobii-calibration"
                  variant="tonal"
                >
                  Калибровка Tobii
                </v-btn>
              </v-col>
              <v-col
                cols="12"
                md="6"
              >
                <v-select
                  v-model="pageTurnMode"
                  :items="pageTurnModeOptions"
                  density="compact"
                  hide-details
                  item-title="text"
                  item-value="value"
                  label="Способ перелистывания"
                />
                <div class="text-caption text-medium-emphasis mt-1">
                  Только для стрелок перелистывания в просмотре набора.
                </div>
              </v-col>
              <v-col
                cols="12"
                md="6"
              >
                <v-checkbox
                  v-model="isExitButton"
                  density="compact"
                  hide-details
                  label="Кнопка выхода из набора глазами"
                />
              </v-col>
            </v-row>

            <v-divider class="my-2" />

            <div class="text-subtitle-2 mb-1">
              Управление и обратная связь
            </div>
            <v-row dense>
              <v-col
                cols="12"
                sm="6"
                md="4"
              >
                <v-checkbox
                  v-model="eyeSelect"
                  density="compact"
                  hide-details
                  label="Выбор глазами"
                />
              </v-col>
              <v-col
                cols="12"
                sm="6"
                md="4"
              >
                <v-checkbox
                  v-model="eyeActivation"
                  density="compact"
                  hide-details
                  label="Активация глазами"
                />
              </v-col>
              <v-col
                cols="12"
                sm="6"
                md="4"
              >
                <v-checkbox
                  v-model="mouseActivation"
                  density="compact"
                  hide-details
                  label="Активация мышкой"
                />
              </v-col>
              <v-col
                cols="12"
                sm="6"
                md="4"
              >
                <v-checkbox
                  v-model="keyboardActivation"
                  density="compact"
                  hide-details
                  label="Активация клавиатурой"
                />
              </v-col>
              <v-col
                cols="12"
                sm="6"
                md="4"
              >
                <v-checkbox
                  v-model="joystickActivation"
                  density="compact"
                  hide-details
                  label="Активация джойстиком"
                />
              </v-col>
              <v-col
                cols="12"
                sm="6"
                md="4"
              >
                <v-checkbox
                  v-model="clickSound"
                  density="compact"
                  hide-details
                  label="Звук щелчка"
                />
              </v-col>
              <v-col
                cols="12"
                sm="6"
                md="4"
              >
                <v-checkbox
                  v-model="animation"
                  density="compact"
                  hide-details
                  label="Анимация изображений"
                />
              </v-col>
            </v-row>

            <template v-if="eyeActivation">
              <v-divider class="my-2" />
              <div class="d-flex align-center ga-3">
                <div class="text-subtitle-2">
                  Задержка взгляда для активации
                </div>
                <v-chip
                  color="primary"
                  size="small"
                  variant="tonal"
                >
                  {{ timeout }} с
                </v-chip>
              </div>
              <v-slider
                v-model="timeout"
                class="mt-1"
                density="compact"
                hide-details
                max="5"
                min="0.1"
                step="0.1"
                thumb-label
              />
            </template>

            <v-divider class="my-2" />
            <div class="text-subtitle-2 mb-1">
              Конфиденциальность
            </div>
            <v-radio-group
              v-model="telemetryConsent"
              density="compact"
              hide-details
              inline
            >
              <v-radio label="Не отправлять" value="disabled" />
              <v-radio label="Отправлять" value="enabled" />
            </v-radio-group>
            <div class="text-caption text-medium-emphasis">
              Отправляются только названия действий и версия приложения. Содержимое карточек, названия файлов, пути и тексты ошибок не отправляются.
            </div>
            <v-btn class="mt-1" size="small" variant="text" @click="openPrivacy">
              Политика конфиденциальности
            </v-btn>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col
        cols="12"
        lg="4"
      >
        <color-settings />
      </v-col>
      <v-col
        cols="12"
        lg="6"
      >
        <voice-settings />
      </v-col>
      <v-col
        cols="12"
        lg="6"
      >
        <input-settings />
      </v-col>
    </v-row>
  </v-container>
</template>

<script lang="ts" setup>
import { computed, onMounted } from "vue";
import { useStore } from "vuex";
import { shell } from "electron";

import ColorSettings from "@/frontend/components/Settings/ColorsSettings.vue";
import VoiceSettings from "@/frontend/components/Settings/VoiceSettings.vue";
import InputSettings from "@/frontend/components/Settings/InputSettings.vue";
import { Telemetry } from "@/frontend/utils/Telemetry";
import type { PageTurnMode } from "@/frontend/store/LINKaStore";
import type { TelemetryConsent } from "@/frontend/utils/TelemetryConsent";

const store = useStore();

const pageTurnModeOptions: { text: string; value: PageTurnMode }[] = [
  { text: "Только мышь", value: "mouseOnly" },
  { text: "Мышь и глаза", value: "mouseAndEyes" }
];

onMounted(() => {
  Telemetry.product("openSettings");
});

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

const pageTurnMode = computed({
  get () {
    return store.state.button.pageTurnMode;
  },
  set (value: PageTurnMode) {
    store.commit("button_pageTurnMode", value);
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
  set () {
    store.dispatch("button_animation_toggle");
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

const telemetryConsent = computed({
  get () {
    return store.state.telemetryConsent as TelemetryConsent;
  },
  set (value: TelemetryConsent) {
    if (value !== "unknown") void store.dispatch("setTelemetryPreference", value);
  }
});

function openPrivacy () {
  shell.openExternal("https://metric.linka.su/privacy");
}

</script>
