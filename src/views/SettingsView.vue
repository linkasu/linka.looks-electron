<template>
  <v-container>
    <v-row>
      <v-col cols="12" md="8">
        <v-card>
          <v-card-title primary-title> Главные настройки </v-card-title>
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
              type="number"
              :label="`Время задержки взгляда для активации в секундах: ${timeout}`"
              v-model="timeout"
              min="0.1"
              max="5"
              step="0.1"
            ></v-slider>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="4">
        <color-settings />
      </v-col>
    </v-row>
    <v-row>
      <v-col cols="12" md="12">
        <input-settings />
      </v-col>
    </v-row>
  </v-container>
</template>

<script lang="ts">
import { Vue, prop, Options } from "vue-class-component";
import ColorSettings from "@/components/Settings/ColorsSettings.vue";
import InputSettings from "@/components/Settings/InputSettings.vue";
import { Metric } from "@/utils/Metric";
class Props {}

@Options({
  components: {
    ColorSettings,
    InputSettings
  }
})
export default class SettingsView extends Vue.with(Props) {
  get timeout () {
    return this.$store.state.button.timeout / 1000;
  }

  set timeout (value: number) {
    this.$store.commit("button_timeout", value * 1000);
  }

  get eyeSelect () {
    return this.$store.state.button.eyeSelect;
  }

  set eyeSelect (value: boolean) {
    this.$store.commit("button_eyeSelect", value);
  }

  get clickSound () {
    return this.$store.state.button.clickSound;
  }

  set clickSound (value: boolean) {
    this.$store.commit("button_clickSound", value);
  }

  get eyeActivation () {
    return this.$store.state.button.eyeActivation;
  }

  set eyeActivation (value: boolean) {
    this.$store.commit("button_eyeActivation", value);
  }

  get joystickActivation () {
    return this.$store.state.button.joystickActivation;
  }

  set joystickActivation (value: boolean) {
    this.$store.commit("button_joystickActivation", value);
  }

  get keyboardActivation () {
    return this.$store.state.button.keyboardActivation;
  }

  set keyboardActivation (value: boolean) {
    this.$store.commit("button_keyboardActivation", value);
  }

  get mouseActivation () {
    return this.$store.state.button.mouseActivation;
  }

  set mouseActivation (value: boolean) {
    this.$store.commit("button_mouseActivation", value);
  }

  get animation () {
    return this.$store.state.button.animation;
  }

  set animation (value: boolean) {
    this.$store.dispatch("button_animation");
  }

  get isExitButton () {
    return this.$store.state.ui.exitButton;
  }

  set isExitButton (value: boolean) {
    this.$store.commit("ui_exitButton", value);
  }

  get enabled () {
    return this.$store.state.button.enabled;
  }

  set enabled (value: boolean) {
    this.$store.commit("button_enabled", value);
  }

  mounted (): void {
    Metric.registerEvent("openSettings");
  }
}
</script>
