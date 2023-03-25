<template>
  <v-layout full-height :style="{'--size': size}" class="root"> 
    <explorer-grid-button v-if="!isHome" :back="true" @click="back()"/>

    <explorer-grid-button v-for="file in sorted" :key="file.file" :file="file" @click="()=>{select(file);}"/> 
  </v-layout>
</template>

<script lang="ts">
import { Vue, Options } from "vue-class-component";
import EyeButton from "@/components/EyeButton.vue";
import ExplorerGridButton from "@/components/HomeView/ExplorerGridButton.vue";
import { ipcRenderer } from "electron";
import { Directory, DirectoryFile } from "@/interfaces/Directory";
import { basename } from "path";

@Options({
  components: {
    ExplorerGridButton
  },
})
export default class HomeView extends Vue {
  files: Directory = [];
  private _root ='';
  size: number =5;
  
  public get sorted() : Directory {
    return this.files.sort((a)=>a.directory?- 1:1)
  }

back(){
  this.root = this.root.split('§').slice(0,-1).join('§')
  
}
  get isHome(){
    
    return this.root=='§'
  }
  
  
  public get root() : string {
    return this._root;
  }
  
  public set root(v : string) {
    this._root  = v;
      this.$router.push(v)
      this.loadSets()

  }
  
  mounted() {
    this.root = this.$route.params.path.toString()
  }

  private loadSets() {
    ipcRenderer.invoke("storage:getFiles", this.root.replace(/§/g, '/')).then((files: Directory) => {
      this.files=files;
    this.size = Math.max( Math.ceil(Math.sqrt(files.length+1)), 4);
      
    });
  }

  select(item:DirectoryFile){
    if(item.directory){
      this.root+='§'+basename(item.file)
    
    } else{

    }   
    
  }
}
</script>

<style scoped>
.root {
  --size: 6;
  display: grid;
   grid-template-columns: repeat(var(--size), 1fr);
   grid-template-rows: repeat(var(--size), 1fr);
  height: calc(100vh - 64px);
}
</style>
