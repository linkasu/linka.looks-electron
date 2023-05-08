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
import { Side } from "@/store/LINKaStore";
import { Vue, prop, Options } from "vue-class-component";

class Props {
  side: Side = prop({
    required: true,
  });
}
@Options({})
export default class KeyBinding extends Vue.with(Props) {
  titles: { [key in Side]: string } = {
    up: "Вверх",
    down: "Вниз",
    left: "Влево",
    right: "Вправо",
    enter: "Выбрать",
  };

  mounted(): void {
    document.addEventListener("keydown", this.onKeyDown);
  }

  unmounted(): void {
    document.removeEventListener("keydown", this.onKeyDown);
  }
  onKeyDown(ev: KeyboardEvent) {
    if (this.isCurrent) {
      this.$store.dispatch("keymap_push", { side: this.side, code: ev.code });
    }
  }
  remove(code: string) {
      this.$store.dispatch("keymap_remove", { side: this.side, code });
  }

  get keys() {
    return this.$store.state.keyMaping[this.side];
  }

  get selected() {
    return this.$store.state.selectedKey;
  }
  set selected(side: Side|undefined) {
    this.$store.commit("selectedKey", side);
  }
  get isCurrent() {
    return this.selected == this.side;
  }
  select() {
    this.selected = this.side;
  }
}
</script>
