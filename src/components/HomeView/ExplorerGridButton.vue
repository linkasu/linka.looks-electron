<template>
  <eye-button>
    <div class="content">
      <div align-center>
        <v-icon v-if="back" class="icon"> mdi-arrow-up </v-icon>
        <v-icon v-else-if="file&&file.directory" class="icon"> mdi-folder </v-icon>
        <div v-else class="img" :style="{'--image': image}" />
      </div>
      <div>
        <span v-if="file">{{ basename(file.file).slice(0,25) }}</span>
        <span v-if="back">Шаг назад</span>
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

class Props {
  file?: DirectoryFile = prop({
    required: false
  });
  back: WithDefault<boolean> = prop({
    default: false,
  });
}
@Options({
  components: {
    EyeButton,
  },
})
export default class ExplorerGridButton extends Vue.with(Props) {
  image?: string = "";

  mounted() {
    
    if (this.back) {
    return
    } 
    if (this.file && !this.file.directory) {
      storageService
      .getDefaultImage(this.file.file)
        .then((buffer) => {
          if(!buffer) return;
          const url = URL.createObjectURL(
            new Blob([buffer], { type: "image/png" } /* (1) */)
          );
          this.image = `url("${url}"`
        });
    }
  }
  basename(path: string) {
    return basename(path);
  }
}
</script>

<style scoped>
.content {
  height: 100%;
  display: grid;
  grid-template-rows: auto 3em;
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
</style>
