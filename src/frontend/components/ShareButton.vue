<template>
  <v-btn flat icon title="Поделиться" @click="share">
    <v-icon>mdi-share-variant</v-icon>
  </v-btn>
</template>

<script lang="ts" setup>
import { useRoute } from "vue-router";
import { storageService } from "@/frontend/services/card-storage-service";
import { Telemetry } from "@/frontend/utils/Telemetry";

const route = useRoute();

function share() {
  storageService.showItemInFolder(route.params.path.toString());
  Telemetry.product("share");
}
</script>
