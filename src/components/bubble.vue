<template>
    <div class="bubble" :style="{left, top}">

    </div>
</template>

<script lang="ts">
import { ipcRenderer } from 'electron';
import { GazeData } from 'tobiiee/build/GazeData';
import {Vue, prop, Options} from 'vue-class-component'

class Props{

}

@Options({

})
export default class Bubble extends Vue.with(Props){
    left ='0px';
    top = '0px'
    mounted(): void {
        
        ipcRenderer.on('eye-point', (event, point: GazeData) => {
           this.left = point.x+'px'
           this.top = point.y+'px'
        });
    }
}
</script>

<style scoped>
    .bubble{
        width: 100px;
        height: 100px;
        background-color: transparent;
        border: 1px solid black;
        position: absolute;
        display: block;
        border-radius: 50px;
        z-index: 500000;
        transform: translate(-50%, -50%);
        box-shadow: rgba(0, 0, 0, 0.3) 2px 2px 2px ;
        pointer-events: none;
    }
</style>