<template>
    <v-app-bar>
        <v-btn  icon  >
            <v-icon>mdi-arrow-left</v-icon>
        </v-btn>
        <v-app-bar-title>
            {{title}}
        </v-app-bar-title>
        <v-spacer/>
        <v-btn  icon  >
            <v-icon>mdi-content-save</v-icon>
        </v-btn>
    </v-app-bar>
</template>

<script lang="ts">
import {Vue, prop, Options} from 'vue-class-component'

class Props{

}

@Options({

})
export default class EditorViewAppBar extends Vue.with(Props){
 get path(): string {
    return this.$route.params.path.toString();
  }
  get title() {
    const arr = this.path.split("§");
    return arr[arr.length - 1];
  }
}
</script>