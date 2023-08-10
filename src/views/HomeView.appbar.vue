<template>
  <v-app-bar>
    <v-app-bar-title>
        {{ title||'LINKa. смотри' }}
    </v-app-bar-title>
    <v-spacer />
    <share-button/>
    <rmdir-button/>
    <mkdir-button />
    <v-btn flat icon :to="newHref">
      <v-icon>mdi-plus</v-icon>
    </v-btn>
    <v-btn flat icon to="/settings">
      <v-icon>mdi-cog</v-icon>
    </v-btn>
  </v-app-bar>
</template>

<script lang="ts">
import { Vue, prop, Options } from "vue-class-component";
import MkdirButton from "@/components/HomeView/MkdirButton.vue";
import RmdirButton from "@/components/HomeView/RmdirButton.vue";
import ShareButton from "@/components/ShareButton.vue";
class Props {}

@Options({
  components: { MkdirButton, RmdirButton, ShareButton }
})
export default class HomeViewAppBar extends Vue.with(Props) {
  public get root (): string {
    return this.$route.params.path.toString();
  }

  public get title () {
    return this.root.slice(this.root.lastIndexOf("§") + 1);
  }

  public get newHref (): string {
    return "/edit/" + this.root.replace(/\//g, "§") + "§" + "new";
  }
}
</script>
