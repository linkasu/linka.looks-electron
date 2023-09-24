<template>
  <v-btn
    flat
    icon
    title="Поделиться"
    @click="share"
  >
    <v-icon>mdi-share-variant</v-icon>
  </v-btn>
</template>

<script lang="ts" setup>
import { useRoute } from "vue-router";
import { useStore } from "vuex";
import { storageService } from "@/frontend/CardsStorage/index";
import { Metric } from "@/frontend/utils/Metric";

const store = useStore();
const route = useRoute();

function share () {
  storageService.showItemInFolder(route.params.path.toString());
  Metric.registerEvent(store.state.pcHash, "share");
}
</script>
