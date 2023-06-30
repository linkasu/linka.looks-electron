<template>
    
    <v-btn flat icon @click="share" title="Поделиться">
      <v-icon>mdi-share-variant</v-icon>
    </v-btn>
</template>

<script lang="ts">
import { storageService } from '@/CardsStorage/frontend';
import { Metric } from '@/utils/Metric';
import {Vue, prop, Options} from 'vue-class-component'

class Props{

}

@Options({

})
export default class ShareButton extends Vue.with(Props){
share(){

    storageService.showItemInFolder(this.$route.params.path.toString());
    Metric.registerEvent('share')
}
}
</script>   