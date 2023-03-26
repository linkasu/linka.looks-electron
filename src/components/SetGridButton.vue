<template>
  <eye-button>
    <div class="content">
      <div align-center>
        <div v-if="card.cardType==0 " class="img" :style="{'--image': image}" />
        <h1 v-if="card.cardType==1 " class="img" >
          ⎵
        </h1>
      </div>
      <div v-if="card.cardType==0" class="text">
        <span >{{card.title.slice(0, 50)}}</span>
      </div>
    </div>
  </eye-button>
</template>

<script lang="ts">
import { Vue, Options, prop, WithDefault } from "vue-class-component";
import EyeButton from "@/components/EyeButton.vue";
import { DirectoryFile } from "@/interfaces/Directory";
import { basename } from "path";
import { ipcRenderer } from "electron";
import { storageService } from "@/CardsStorage/frontend";
import { Card } from "@/interfaces/ConfigFile";

class Props {
  card: Card = prop({
    required: true
  });
  file: string  = prop({
    required: true
  })
}
@Options({
  components: {
    EyeButton,
  },
})
export default class SetGridButton extends Vue.with(Props) {
  image?: string = "";
  
  mounted() {
    
    if (this.card && this.card.imagePath) {
      if(this.card.cardType==-0){
      storageService
      .getImage(this.file, this.card.imagePath)
        .then((buffer) => {
          if(!buffer) return;
          const url = URL.createObjectURL(
            new Blob([buffer], { type: "image/png" } /* (1) */)
          );
          this.image = `url("${url}"`
        });
      }
     }
  }
}
</script>

<style scoped>
.content {
  height: 100%;
  display: grid;
  grid-template-rows: 8fr 4fr;
  gap: 1em;
}
.icon {
  height: 100%;
  font-size: 5em;
}
.img {
  background-image: var(--image);
  background-position: center;
  background-repeat: no-repeat;
  height: 80%;
  width: 80%;
  margin: 10%;
  background-size: contain  ;
}
.text{

height: 100%;
  overflow: hidden;
}
</style>
