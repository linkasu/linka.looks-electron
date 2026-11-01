<template>
  <v-btn
    flat
    :icon="!text"
    :prepend-icon="text ? 'mdi-share-variant' : undefined"
    :title="text || 'Показать файл для отправки'"
    :aria-label="text || 'Показать файл для отправки'"
    @click="share"
  >
    <v-icon v-if="!text">mdi-share-variant</v-icon>
    {{ text }}
  </v-btn>
</template>

<script lang="ts" setup>
import { useRoute } from "vue-router";
import { storageService } from "@/frontend/services/card-storage-service";
import { Telemetry } from "@/frontend/utils/Telemetry";

const route = useRoute();
defineProps<{ text?: string }>();

function share() {
  storageService.showItemInFolder(route.params.path.toString());
  Telemetry.product("share");
}
</script>
