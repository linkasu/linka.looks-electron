<template>
  <v-card :variant="isCurrent ? 'tonal' : 'outlined'" :color="isCurrent ? 'primary' : undefined">
    <v-card-title primary-title>
      {{ titles[side] }}
    </v-card-title>
    <v-card-text>
      <v-btn
        v-for="key of keys"
        :key="key"
        class="ma-1"
        variant="outlined"
        min-height="48"
        :aria-label="`Удалить назначение ${key}`"
        @click="remove(key)"
      >
        {{ key }}
        <v-icon end aria-hidden="true">mdi-close</v-icon>
      </v-btn>
      <p v-if="!keys.length">Не назначено</p>
      <p v-if="isCurrent" role="status" class="mt-3">Ожидание клавиши… Escape — отменить.</p>
    </v-card-text>
    <v-card-actions>
      <v-btn v-if="!isCurrent" class="assign-key" min-height="48" variant="tonal" @click="select()"
        >Назначить</v-btn
      >
      <v-btn v-else min-height="48" @click="selected = undefined">Отменить</v-btn>
    </v-card-actions>
  </v-card>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted } from "vue";
import { useStore } from "vuex";
import { Side } from "@/frontend/store/LINKaStore";

const store = useStore();

const props = defineProps<{ side: Side }>();

const titles: { [key in Side]: string } = {
  up: "Вверх",
  down: "Вниз",
  left: "Влево",
  right: "Вправо",
  enter: "Выбрать"
};

onMounted((): void => {
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("joystick-keydown", onJoystickKeyDown);
});

onUnmounted((): void => {
  if (isCurrent.value) selected.value = undefined;
  document.removeEventListener("keydown", onKeyDown);
  document.removeEventListener("joystick-keydown", onJoystickKeyDown);
});

const keys = computed(() => {
  return store.state.keyMapping[props.side];
});

const selected = computed({
  get() {
    return store.state.selectedKey;
  },
  set(side: Side | undefined) {
    store.commit("selectedKey", side);
  }
});

const isCurrent = computed(() => {
  return selected.value === props.side;
});

function onKeyDown(ev: KeyboardEvent) {
  if (isCurrent.value) {
    ev.preventDefault();
    if (ev.code === "Escape") {
      selected.value = undefined;
      return;
    }
    store.dispatch("keymap_push", { side: props.side, code: ev.code });
  }
}

function onJoystickKeyDown() {
  // Listener is intentionally empty: PageWatcher consumes joystick events globally.
}

function remove(code: string) {
  store.dispatch("keymap_remove", { side: props.side, code });
}

function select() {
  selected.value = props.side;
}
</script>
