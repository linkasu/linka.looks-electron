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
                    v-model="keyboardActivaton"
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
class Props {}

@Options({
  components: {
    ColorSettings,
    InputSettings,
  },
})
export default class SettingsView extends Vue.with(Props) {
  get timeout() {
    return this.$store.getters.button_timeout / 1000;
  }
  set timeout(value: number) {
    this.$store.commit("button_timeout", value * 1000);
  }
  get eyeSelect() {
    return this.$store.getters.button_eyeSelect;
  }
  set eyeSelect(value: boolean) {
    this.$store.commit("button_eyeSelect", value);
  }
  get eyeActivation() {
    return this.$store.getters.button_eyeActivation;
  }
  set eyeActivation(value: boolean) {
    this.$store.commit("button_eyeActivation", value);
  }
  get joystickActivation() {
    return this.$store.getters.button_joystickActivation;
  }
  set joystickActivation(value: boolean) {
    this.$store.commit("button_joystickActivation", value);
  }
  get keyboardActivaton() {
    return this.$store.getters.button_keyboardActivaton;
  }
  set keyboardActivaton(value: boolean) {
    this.$store.commit("button_keyboardActivaton", value);
  }
  get mouseActivation() {
    return this.$store.getters.button_mouseActivation;
  }
  set mouseActivation(value: boolean) {
    this.$store.commit("button_mouseActivation", value);
  }

  get isExitButton() {
    return this.$store.getters.ui_exitButton;
  }
  set isExitButton(value: boolean) {
    this.$store.commit("ui_exitButton", value);
  }

  get enabled() {
    return this.$store.getters.button_enabled;
  }
  set enabled(value: boolean) {
    this.$store.commit("button_enabled", value);
  }
}
</script>
