<template>
  <v-card :color="isCurrent ? 'primary' : ''">
    <v-card-title primary-title> {{ titles[side] }} </v-card-title>
    <v-card-text>
      <v-chip v-for="key of keys" closable @click:close="remove(key)">
        {{ key }}
      </v-chip>
    </v-card-text>
    <v-card-actions>
      <v-btn @click="select()" color="success">Назначить</v-btn>
    </v-card-actions>
  </v-card>
</template>

<script lang="ts">
import { Side } from "@frontend/store/LINKaStore";
import { Vue, prop, Options } from "vue-class-component";

class Props {
  side: Side = prop({
    required: true
  });
}
@Options({})
export default class KeyBinding extends Vue.with(Props) {
  titles: { [key in Side]: string } = {
    up: "Вверх",
    down: "Вниз",
    left: "Влево",
    right: "Вправо",
    enter: "Выбрать"
  };

  mounted (): void {
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("joystick-keydown", console.log);
  }

  unmounted (): void {
    document.removeEventListener("keydown", onKeyDown);
  }

  onKeyDown (ev: KeyboardEvent) {
    if (isCurrent) {
      store.dispatch("keymap_push", { side: side, code: ev.code });
    }
  }

  remove (code: string) {
    store.dispatch("keymap_remove", { side: side, code });
  }

  get keys () {
    return store.state.keyMapping[side];
  }

  get selected () {
    return store.state.selectedKey;
  }

  set selected (side: Side|undefined) {
    store.commit("selectedKey", side);
  }

  get isCurrent () {
    return selected == side;
  }

  select () {
    selected = side;
  }
}
</script>
