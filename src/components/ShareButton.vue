<template>

    <v-btn flat icon @click="share" title="Поделиться">
      <v-icon>mdi-share-variant</v-icon>
    </v-btn>
</template>

<script lang="ts">
import { storageService } from "@fronend/CardsStorage/index";
import { Metric } from "@frontend/utils/Metric";
import { Vue, prop, Options } from "vue-class-component";

class Props {

}

@Options({

})
export default class ShareButton extends Vue.with(Props) {
  share () {
    storageService.showItemInFolder(route.params.path.toString());
    Metric.registerEvent("share");
  }
}
</script>
