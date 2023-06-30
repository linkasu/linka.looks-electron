<template>
    <v-dialog v-model="dialog" persistent max-width="60%">
        <v-card>
            <v-card-title class="text-h5" v-if="!downloading">
                Вы хотите скачать дополнительные наборы?

            </v-card-title>
            <v-card-title v-else>
                Идет загрузка. 
            </v-card-title>
            <v-card-text v-if="!downloading">
                <o> Совсем скоро вы сможете начать пользоваться программой LINKa смотри, однако, сейчас в ней только два
                    готовых набора. Клавиатура и цифры. </o>
                <p>
                    Но дефектолог Ольга Унгуряну предоставила пакет бесплатных наборов, которые отлично подходят для старта
                    работы с программой.
                </p>
                <p>
                    Хотите их скачать?
                </p>
            </v-card-text>
            <v-card-text v-if="downloading">
                
                <v-progress-linear color="green" :model-value="progress"></v-progress-linear>
            </v-card-text>
        
            <v-card-actions v-if="!downloading">
                <v-spacer></v-spacer>
                <v-btn color="error" variant="text" @click="dialog = false">
                    Отказаться
                </v-btn>
                <v-btn color="green-darken-1" variant="text" @click="download()">
                    Загрузить
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script lang="ts">
import { storageService } from '@/CardsStorage/frontend'
import { ipcRenderer } from 'electron'
import { Vue, prop, Options } from 'vue-class-component'

class Props {

}

@Options({
    watch: {
        dialog: 'onDialog'
    }
})

export default class DownloadDefaultSetsDialog extends Vue.with(Props) {
    dialog = false
    downloading = false
    progress = 0
    mounted(): void {

       this.dialog = !this.$store.state.defaultSetsDownloaded
// this.dialog = true
        this.$store.commit('button_enabled', !this.dialog)
        ipcRenderer.on('download_progress', (event, progress)=>{
            this.progress = progress
        })
    }

    async download(){
        this.downloading = true
        await storageService.downloadAndUnpack("https://linka.su/sets.zip")
        this.dialog = false
        window.location.reload()
    }

    onDialog(v: boolean) {
        this.$store.commit('button_enabled', !v)
        this.$store.commit('defaultSetsDownloaded', !v)
    }
}
</script>