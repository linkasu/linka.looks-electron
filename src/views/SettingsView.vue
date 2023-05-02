<template>
 <v-container row wrap>
<v-flex>   <v-card  md8 xs12>
        <v-card-title primary-title>
            Главные настройки
        </v-card-title>
        <v-card-text>
            <v-checkbox label="Активировать карточку при удержании взгляда" v-model="eyetrackerTimeout" value="value"></v-checkbox>
        </v-card-text>
    </v-card>
    <v-card md4>
        <v-card-title >
            Настройки цвета
        </v-card-title>
        <v-card-text>
            <v-text-field
                label="Цвет №1"
                v-model="colorPrimary"
                type="color"
            ></v-text-field>
            <v-text-field
                label="Цвет №2"
                v-model="colorAccent"
                type="color"
            ></v-text-field>
            <v-text-field
                label="Цвет границ"
                v-model="colorSecondary"
                type="color"
            ></v-text-field>
            <v-row>
                <v-btn color="success" @click="makeDefault">Назначить стандартную цветовую схему</v-btn>
                <v-btn color="success" @click="makeBG">Назначить черно-белую цветовую схему</v-btn>
            </v-row>
        </v-card-text>
    </v-card>
</v-flex>
 </v-container>   
</template>

<script lang="ts">
import {Vue, prop, Options} from 'vue-class-component'

class Props{

}

@Options({

})
export default class SettingsView extends Vue.with(Props){
    
    eyetrackerTimeout = true

    get colorPrimary(){
        return this.$store.state.colors.primary
    }
    set colorPrimary(v:string){
        this.$store.commit('colors_primary', v)
    }
    get colorAccent(){
        return this.$store.state.colors.accent
    }
    set colorAccent(v:string){
        this.$store.commit('colors_accent', v)
    }
    get colorSecondary(){
        return this.$store.state.colors.secondary
    }
    set colorSecondary(v:string){
        this.$store.commit('colors_secondary', v)
    }

    makeDefault(){
        this.colorPrimary = '#197377'
        this.colorAccent = '#7DF6FA'
        this.colorSecondary = '#FFD200'
    }
    makeBG(){
        this.colorPrimary = '#DDDDDD'
        this.colorAccent = '#FFFFFF'
        this.colorSecondary = '#FfFFFF'
    }
}
</script>