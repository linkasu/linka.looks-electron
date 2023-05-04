<template>
  <v-card>
    <v-card-title primary-title> Настройки кнопок </v-card-title>
    <v-card-text>
      <v-container>
        <v-row>
          <v-col cols="3" xs="4" v-for="side in sides">
            <key-binding :side="side" />
          </v-col>
        </v-row>
      </v-container>
    </v-card-text>
  </v-card>
</template>

<script lang="ts">
import { Vue, prop, Options } from "vue-class-component";
import KeyBinding from "./KeyBinding.vue";
import store from "@/store";
class Props {}

@Options({
  components: { KeyBinding },
})
export default class InputSettings extends Vue.with(Props) {
    sides = Object.keys( store.state.keyMaping)
  mounted(): void {}
}
</script>
