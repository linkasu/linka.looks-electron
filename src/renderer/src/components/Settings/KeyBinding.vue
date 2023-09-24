<template>
  <v-card :color="isCurrent ? 'primary' : ''">
    <v-card-title primary-title>
      {{ titles[side] }}
    </v-card-title>
    <v-card-text>
      <v-chip
        v-for="key of keys"
        :key="key"
        closable
        @click:close="remove(key)"
      >
        {{ key }}
      </v-chip>
    </v-card-text>
    <v-card-actions>
      <v-btn
        color="success"
        @click="select()"
      >
        Назначить
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script lang="ts" setup>
import { defineProps, computed, onMounted, onUnmounted } from 'vue'
import { useStore } from 'vuex'
import { Side } from '@frontend/store/LINKaStore'

const store = useStore()

const props = defineProps<{ side: Side }>()

const titles: { [key in Side]: string } = {
  up: 'Вверх',
  down: 'Вниз',
  left: 'Влево',
  right: 'Вправо',
  enter: 'Выбрать'
}

onMounted((): void => {
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('joystick-keydown', console.log)
})

onUnmounted((): void => {
  document.removeEventListener('keydown', onKeyDown)
})

const keys = computed(() => {
  return store.state.keyMapping[props.side]
})

const selected = computed({
  get() {
    return store.state.selectedKey
  },
  set(side: Side | undefined) {
    store.commit('selectedKey', side)
  }
})

const isCurrent = computed(() => {
  return selected.value == props.side
})

function onKeyDown(ev: KeyboardEvent) {
  if (isCurrent.value) {
    store.dispatch('keymap_push', { side: props.side, code: ev.code })
  }
}

function remove(code: string) {
  store.dispatch('keymap_remove', { side: props.side, code })
}

function select() {
  selected.value = props.side
}
</script>
