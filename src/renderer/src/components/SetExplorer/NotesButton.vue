<template>
  <v-dialog
    v-model="dialog"
    width="auto"
  >
    <template #activator="{ props }">
      <v-btn
        title="Заметки о наборе"
        flat
        icon=""
        v-bind="props"
      >
        <v-icon>mdi-note-text</v-icon>
      </v-btn>
    </template>

    <v-card
      min-width="600px"
      min-height="200px"
    >
      <v-card-title primary-title>
        Заметки к набору
      </v-card-title>
      <v-card-text v-if="!edit">
        <pre>{{ description }} </pre>
      </v-card-text>
      <v-card-text v-else>
        <v-textarea
          v-model="description"
          multi-line
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          color="primary"
          @click="dialog = false"
        >
          Закрыть
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { defineProps, withDefaults, computed, ref, watch } from 'vue'
import { useStore } from 'vuex'
import { ConfigFile } from '@common/interfaces/ConfigFile'

const store = useStore()

const props = withDefaults(defineProps<{ config: ConfigFile; edit: boolean }>(), {
  edit: false
})

const dialog = ref(false)

watch(dialog, onDialog)

const description = computed({
  get() {
    return props.edit ? store.state.editor.description : props.config.description
  },
  set(text: string | undefined) {
    store.commit('editor_description', text)
  }
})

function onDialog(value: boolean) {
  store.commit('button_enabled', !dialog.value)
}
</script>
