<template>
  <v-container fluid class="settings-view py-6">
    <v-row dense>
      <v-col cols="12" lg="8">
        <v-card density="compact">
          <v-card-title> Управление коммуникатором </v-card-title>
          <v-card-text class="py-2">
            <h2 id="settings-selection" class="text-subtitle-1 mb-2">1. Как выбирать карточку</h2>
            <p class="settings-explanation mb-2">
              Выбор выделяет карточку, но ещё не запускает её действие. Можно сочетать способы
              управления — настройки ниже не исключают друг друга.
            </p>
            <v-checkbox v-model="eyeSelect" density="compact" hide-details label="Выбор глазами" />
            <p class="text-caption text-medium-emphasis mb-3">
              Для клавиатуры и джойстика назначьте кнопки перемещения в разделе ниже.
            </p>
            <details class="settings-disclosure">
              <summary>Настройка экрана и Tobii</summary>
              <v-row dense class="mt-2">
                <v-col cols="12" sm="6">
                  <v-btn block min-height="48" variant="outlined" to="/calibration"
                    >Настройка масштаба экрана</v-btn
                  >
                </v-col>
                <v-col cols="12" sm="6">
                  <v-btn
                    block
                    color="primary"
                    density="comfortable"
                    to="/tobii-calibration"
                    variant="tonal"
                    min-height="48"
                  >
                    Калибровка Tobii
                  </v-btn>
                </v-col>
              </v-row>
            </details>
            <details class="settings-disclosure">
              <summary>Перелистывание и выход из набора</summary>
              <v-row dense class="mt-2">
                <v-col cols="12" md="6">
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
                <v-col cols="12" md="6">
                  <v-checkbox
                    v-model="isExitButton"
                    density="compact"
                    hide-details
                    label="Кнопка выхода из набора глазами"
                  />
                </v-col>
              </v-row>
            </details>

            <v-divider class="my-2" />

            <h2 id="settings-activation" class="text-subtitle-1 mb-2">2. Как запускать действие</h2>
            <p class="settings-explanation mb-3">
              Активация запускает действие выбранной карточки. Оставьте удобные способы включёнными
              одновременно: взгляд после задержки, щелчок мыши или назначенная кнопка.
            </p>
            <v-row dense>
              <v-col cols="12" sm="6" md="4">
                <v-checkbox
                  v-model="eyeActivation"
                  density="compact"
                  hide-details
                  label="Активация глазами"
                />
              </v-col>
              <v-col cols="12" sm="6" md="4">
                <v-checkbox
                  v-model="mouseActivation"
                  density="compact"
                  hide-details
                  label="Активация мышкой"
                />
              </v-col>
              <v-col cols="12" sm="6" md="4">
                <v-checkbox
                  v-model="keyboardActivation"
                  density="compact"
                  hide-details
                  label="Активация клавиатурой"
                />
              </v-col>
              <v-col cols="12" sm="6" md="4">
                <v-checkbox
                  v-model="joystickActivation"
                  density="compact"
                  hide-details
                  label="Активация джойстиком"
                />
              </v-col>
            </v-row>
            <details class="settings-disclosure">
              <summary>Назначить клавиши и кнопки джойстика</summary>
              <input-settings class="mt-2" />
            </details>

            <template v-if="eyeActivation">
              <v-divider class="my-2" />
              <div class="d-flex align-center ga-3">
                <h2 class="text-subtitle-1">3. Сколько удерживать взгляд</h2>
                <v-chip color="primary" size="small" variant="tonal"> {{ timeout }} с </v-chip>
              </div>
              <p class="settings-explanation mt-2">
                Удерживайте взгляд на карточке {{ timeout }} с, чтобы запустить действие. Увеличьте
                задержку, если карточки срабатывают раньше, чем нужно.
              </p>
              <v-slider
                v-model="timeout"
                class="mt-1"
                density="compact"
                hide-details
                max="5"
                min="0.1"
                step="0.1"
                thumb-label
                aria-label="Задержка взгляда для активации в секундах"
              />
            </template>

            <v-divider class="my-2" />
            <h2 id="settings-trial" class="text-subtitle-1 mb-2">Проверить без последствий</h2>
            <p class="settings-explanation mb-3">
              Выберите и активируйте пробную карточку привычным способом. Она только подтвердит
              срабатывание: ничего не произнесёт и не откроет.
            </p>
            <eye-button
              class="settings-trial"
              data-testid="settings-trial-button"
              @click="trialCount += 1"
            >
              Пробная карточка
            </eye-button>
            <p class="mt-2" role="status" data-testid="settings-trial-status">
              {{ trialCount ? `Сработало: ${trialCount}` : "Ожидание активации" }}
            </p>
            <p v-if="!store.state.button.enabled" class="text-caption text-medium-emphasis">
              Управление приостановлено. Включите его в наборе, затем вернитесь к проверке.
            </p>
            <details class="settings-disclosure">
              <summary>Звук щелчка и анимация</summary>
              <v-checkbox v-model="clickSound" hide-details label="Звук щелчка" />
              <v-checkbox v-model="animation" hide-details label="Анимация изображений" />
            </details>
            <details class="settings-disclosure">
              <summary>Конфиденциальность</summary>
              <v-radio-group v-model="telemetryConsent" density="compact" hide-details inline>
                <v-radio label="Не отправлять" value="disabled" />
                <v-radio label="Отправлять" value="enabled" />
              </v-radio-group>
              <div class="text-caption text-medium-emphasis">
                Отправляются только названия действий и версия приложения. Содержимое карточек,
                названия файлов, пути и тексты ошибок не отправляются.
              </div>
              <v-btn class="mt-2" min-height="48" variant="text" @click="openPrivacy">
                Политика конфиденциальности
              </v-btn>
            </details>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" lg="4">
        <details class="settings-disclosure settings-secondary">
          <summary>Оформление карточек</summary>
          <color-settings class="mt-2" />
        </details>
        <details class="settings-disclosure settings-secondary">
          <summary>Голос и проверка произношения</summary>
          <voice-settings class="mt-2" />
        </details>
      </v-col>
    </v-row>
  </v-container>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from "vue";
import { useStore } from "vuex";
import { shell } from "electron";

import ColorSettings from "@/frontend/components/Settings/ColorsSettings.vue";
import VoiceSettings from "@/frontend/components/Settings/VoiceSettings.vue";
import InputSettings from "@/frontend/components/Settings/InputSettings.vue";
import EyeButton from "@/frontend/components/EyeButton.vue";
import { Telemetry } from "@/frontend/utils/Telemetry";
import type { PageTurnMode } from "@/frontend/store/LINKaStore";
import type { TelemetryConsent } from "@/frontend/utils/TelemetryConsent";

const store = useStore();
const trialCount = ref(0);

const pageTurnModeOptions: { text: string; value: PageTurnMode }[] = [
  { text: "Только мышь", value: "mouseOnly" },
  { text: "Мышь и глаза", value: "mouseAndEyes" }
];

onMounted(() => {
  Telemetry.product("openSettings");
});

const timeout = computed({
  get() {
    return store.state.button.timeout / 1000;
  },
  set(value: number) {
    store.commit("button_timeout", value * 1000);
  }
});

const eyeSelect = computed({
  get() {
    return store.state.button.eyeSelect;
  },
  set(value: boolean) {
    store.commit("button_eyeSelect", value);
  }
});

const clickSound = computed({
  get() {
    return store.state.button.clickSound;
  },
  set(value: boolean) {
    store.commit("button_clickSound", value);
  }
});

const pageTurnMode = computed({
  get() {
    return store.state.button.pageTurnMode;
  },
  set(value: PageTurnMode) {
    store.commit("button_pageTurnMode", value);
  }
});

const eyeActivation = computed({
  get() {
    return store.state.button.eyeActivation;
  },
  set(value: boolean) {
    store.commit("button_eyeActivation", value);
  }
});

const joystickActivation = computed({
  get() {
    return store.state.button.joystickActivation;
  },
  set(value: boolean) {
    store.commit("button_joystickActivation", value);
  }
});

const keyboardActivation = computed({
  get() {
    return store.state.button.keyboardActivation;
  },
  set(value: boolean) {
    store.commit("button_keyboardActivation", value);
  }
});

const mouseActivation = computed({
  get() {
    return store.state.button.mouseActivation;
  },
  set(value: boolean) {
    store.commit("button_mouseActivation", value);
  }
});

const animation = computed({
  get() {
    return store.state.button.animation;
  },
  set() {
    store.dispatch("button_animation_toggle");
  }
});

const isExitButton = computed({
  get() {
    return store.state.ui.exitButton;
  },
  set(value: boolean) {
    store.commit("ui_exitButton", value);
  }
});

const telemetryConsent = computed({
  get() {
    return store.state.telemetryConsent as TelemetryConsent;
  },
  set(value: TelemetryConsent) {
    if (value !== "unknown") void store.dispatch("setTelemetryPreference", value);
  }
});

function openPrivacy() {
  shell.openExternal("https://metric.linka.su/privacy");
}
</script>

<style scoped>
.settings-view {
  max-width: 1440px;
}
.settings-explanation {
  color: var(--linka-muted);
  line-height: 1.6;
}
.settings-disclosure {
  margin-top: 12px;
}
.settings-disclosure > summary {
  padding: 12px 4px;
  min-height: 48px;
  cursor: pointer;
  font-weight: 600;
}
.settings-secondary {
  border-bottom: 1px solid var(--linka-border);
}
.settings-trial {
  height: 100px;
  max-width: 360px;
  font-size: 1.125rem;
}
.settings-view :deep(.v-card-title) {
  white-space: normal;
  font-size: 1.25rem;
  line-height: 1.4;
  padding-top: 20px;
  padding-bottom: 12px;
}
.settings-view :deep(.v-card) {
  border: 1px solid var(--linka-border);
  border-radius: 16px;
  box-shadow: none;
}
.settings-view :deep(.v-selection-control) {
  min-height: 48px;
}
.settings-view :deep(.v-divider) {
  margin-block: 20px !important;
}
</style>
