<template>
    <v-layout full-height class="output-line">
        <eye-button>
            <v-icon>
                mdi-lock
            </v-icon>
        </eye-button>
        <eye-button>
            <h1>text</h1>
        </eye-button>
        <eye-button @click="backspace">
            <v-icon>
                mdi-backspace
            </v-icon>
        </eye-button>
        <eye-button>
            <v-icon>
                mdi-delete
            </v-icon>
        </eye-button>
    </v-layout>
</template>

<script lang="ts">
import { Vue, Options } from 'vue-class-component';
import EyeButton from '@/components/EyeButton.vue'
@Options({
    components:{
        EyeButton
    }
})
export default  class OutpuiLine extends Vue {

    backspace(){
        console.log('hi ')
    }
}
</script>

<style scoped>
    .output-line{
        display: grid;
        grid-template-columns: 1fr 7fr 1fr 1fr;
        gap: 4px;
    }
</style>