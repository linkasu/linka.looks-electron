<template>
  <v-app-bar>
    <exit-button @exit="$router.back()" />

    <v-app-bar-title>Настройки</v-app-bar-title>
  </v-app-bar>  
</template>

<script lang="ts">
import {Vue, prop, Options} from 'vue-class-component'
import ExitButton from "@/components/EditorView/ExitButton.vue";

class Props{

}

@Options({
components:{
    ExitButton
}
})
export default class SettingsViewAppBar extends Vue.with(Props){

}
</script>