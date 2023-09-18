<template>
  <eye-button>
    <div class="content">
      <div align-center>
        <v-icon v-if="back" class="icon" color="primary"> mdi-arrow-up </v-icon>
        <v-icon v-else-if="file&&file.directory" class="icon" color="primary"> mdi-folder </v-icon>
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
import EyeButton from "@frontend/components/EyeButton.vue";
import { DirectoryFile } from "@common/interfaces/Directory";
import { basename } from "path";
import { ipcRenderer } from "electron";
import { storageService } from "@frontend/CardsStorage/index";

class Props {
  file?: DirectoryFile = prop({
    required: false
  });

  back: WithDefault<boolean> = prop({
    default: false
  });
}
@Options({
  components: {
    EyeButton
  }
})
export default class ExplorerGridButton extends Vue.with(Props) {
  image?: string = "";

  mounted () {
    if (back) {
      return;
    }
    if (file && !file.directory) {
      storageService
        .getDefaultImage(file.file)
        .then((buffer) => {
          if (!buffer) return;
          const url = URL.createObjectURL(
            new Blob([buffer], { type: "image/png" } /* (1) */)
          );
          image = `url("${url}"`;
        });
    }
  }

  basename (path: string) {
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
