  <template>
    <v-dialog
      v-model="dialog"
      fullscreen
      :scrim="false"
      transition="dialog-bottom-transition"
    >
      <template v-slot:activator="{ props }">
        <v-btn icon v-bind="props" title="Переместить набор">
          <v-icon>mdi-folder-swap</v-icon>
        </v-btn>
      </template>
      <v-card>
        <v-toolbar >
          <v-btn icon dark @click="dialog = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
          <v-btn icon @click="open('/')">
            <v-icon>mdi-home</v-icon>
          </v-btn>
          <v-toolbar-title >{{basename( current==='/'?'LINKa':current)}}</v-toolbar-title>
          <v-spacer></v-spacer>
          <v-toolbar-items>
            <v-btn variant="text" @click="$emit('move', current); dialog = false"> Переместить сюда</v-btn>
          </v-toolbar-items>
        </v-toolbar>
        <v-card-text>
          <v-list density="compact" @click:open="">
            <v-list-item
              v-for="(item, i) in dirs"
              :key="i"
              :value="item"
              @click="open(item.file)"
            >
              <template v-slot:prepend>
                <v-icon>mdi-folder</v-icon>
              </template>

              <v-list-item-title v-text="basename(item.file)"></v-list-item-title>
            </v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </v-dialog>
  </template>

<script lang="ts">
import { HOME_DIR } from "@/CardsStorage/constants";
import { storageService } from "@/CardsStorage/frontend";
import { Directory } from "@/interfaces/Directory";
import { basename, join, normalize } from "path";
import { Vue, prop, Options } from "vue-class-component";

class Props {
  file: string = prop({
    required: true
  });
}

  @Options({
    watch: {
      dialog: "onDialog"
    }
  })
export default class FolderButton extends Vue.with(Props) {
  dialog = false;
  dirs: Directory = [];
  current: string = this.file.split("§").slice(0, -1).join("/");
  onDialog (v: boolean) {
    this.$store.commit("button_enabled", !v);
    if (v) {
      this.current = this.file.split("§").slice(0, -1).join("/");
      this.loadSet();
    }
  }

  open (file: string) {
    this.current = normalize(file);
    this.loadSet();
  }

  async loadSet () {
    if (!this.current) return;
    const dirs = (await storageService.getFiles(this.current))?.filter(
      (f) => f.directory
    );
    if (!dirs) return;
    let c = this.current;
    if (!c.includes(HOME_DIR)) {
      c = join(HOME_DIR, c);
    }
    c = join(c);
    const parts = c.split("/")
      .filter(p => !!p);
    if (c.replace(HOME_DIR, "").length > 1) {
      dirs.unshift({
        directory: true,
        file: this.current + "/.."
      });
    }
    this.dirs = dirs;
  }

  basename (s: string) {
    return basename(s);
  }
}
</script>
