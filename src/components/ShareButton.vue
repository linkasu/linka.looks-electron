<template>
    <v-btn flat icon @click="share" title="Поделиться">
      <v-icon>mdi-share-variant</v-icon>
    </v-btn>
</template>

<script lang="ts" setup>
import { useRoute } from "vue-router";
import { storageService } from "@fronend/CardsStorage/index";
import { Metric } from "@frontend/utils/Metric";

const route = useRoute();

function share () {
  storageService.showItemInFolder(route.params.path.toString());
  Metric.registerEvent("share");
}
</script>
