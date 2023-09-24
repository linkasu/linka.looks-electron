<template>
  <v-dialog
    v-model="dialog"
    fullscreen
    :scrim="false"
    transition="dialog-bottom-transition"
  >
    <template #activator="{ props: activator_props }">
      <v-btn
        icon
        v-bind="activator_props"
        title="Переместить набор"
      >
        <v-icon>mdi-folder-swap</v-icon>
      </v-btn>
    </template>
    <v-card>
      <v-toolbar>
        <v-btn
          icon
          dark
          @click="dialog = false"
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>
        <v-btn
          icon
          @click="open('/')"
        >
          <v-icon>mdi-home</v-icon>
        </v-btn>
        <v-toolbar-title>{{ toBasename(current === '/' ? 'LINKa' : current) }}</v-toolbar-title>
        <v-spacer />
        <v-toolbar-items>
          <v-btn
            variant="text"
            @click="
              emit('move', current),
              dialog = false
            "
          >
            Переместить сюда
          </v-btn>
        </v-toolbar-items>
      </v-toolbar>
      <v-card-text>
        <v-list
          density="compact"
          @click.prevent="open"
        >
          <v-list-item
            v-for="(item, i) in dirs"
            :key="i"
            :value="item"
            @click="open(item.file)"
          >
            <template #prepend>
              <v-icon>mdi-folder</v-icon>
            </template>

            <v-list-item-title>
              {{ toBasename(item.file) }}
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import type { Ref } from 'vue'
import { defineProps, defineEmits, ref, watch } from 'vue'
import { useStore } from 'vuex'

import { HOME_DIR } from '@electron/CardsStorage/constants'
import { storageService } from '@frontend/CardsStorage/index'
import { Directory } from '@common/interfaces/Directory'
import pathModule from 'path'
import { DirectoryFile } from '../../../common/interfaces/Directory'

const store = useStore()
const props = defineProps<{ file: string }>()
const emit = defineEmits<{ (e: 'move', payload: string): void }>()

const dialog = ref(false)
const dirs: Directory = ref([])
const current: Ref<string> = ref(props.file.split('§').slice(0, -1).join('/'))

watch(dialog, onDialog)

function onDialog(v: boolean) {
  store.commit('button_enabled', !v)
  if (v) {
    current.value = props.file.split('§').slice(0, -1).join('/')
    loadSet()
  }
}

function open(file: string) {
  current.value = pathModule.normalize(file)
  loadSet()
}

async function loadSet() {
  if (!current.value) return
  const loadedDirectories = (await storageService.getFiles(current.value))?.filter(
    (f: DirectoryFile) => f.directory
  )
  if (!loadedDirectories) return
  let c = current.value
  if (!c.includes(HOME_DIR)) {
    c = pathModule.join(HOME_DIR, c)
  }
  c = pathModule.join(c)
  const parts = c.split('/').filter((p) => !!p)
  if (c.replace(HOME_DIR, '').length > 1) {
    loadedDirectories.value.unshift({
      directory: true,
      file: current.value + '/..'
    })
  }
  loadedDirectories.value = loadedDirectories
}

function toBasename(s: string) {
  return pathModule.basename(s)
}
</script>
