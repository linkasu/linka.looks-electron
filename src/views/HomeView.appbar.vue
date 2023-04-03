<template>
    <v-app-bar>
        <v-spacer/>
        <v-btn flat icon :to="newHref">

            <v-icon>mdi-plus</v-icon>
        </v-btn>
    </v-app-bar>
</template>

<script lang="ts">
import {Vue, prop, Options} from 'vue-class-component'

class Props{

}

@Options({

})
export default class HomeViewAppBar extends Vue.with(Props){
    
    public get root() : string {
        return this.$route.params.path.toString()
    }
    
    public get newHref() : string {

        return '/edit/'+this.root.replace(/\//g,'§')+'§'+'new'
    }
    
}
</script>