<template>
    <div>
        <v-dialog v-model="showPopup" persistent max-width="500px">
            <v-card v-if="pData">
                <v-card-title>
                    <span class="headline">{{ pData.title }}</span>
                </v-card-title>
                <v-card-text>{{ pData.description }}</v-card-text>
                <v-card-text>
                    <v-list dense>
                        <v-list-item v-for="(value, key) in pData.links" :key="key">
                            <v-list-item-title>
                                <a @click.prevent="openLink(key.toString())" :href="key.toString()">{{ value }}</a>
                            </v-list-item-title>
                        </v-list-item>
                    </v-list>
                </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn color="primary" @click="closePopup">Закрыть</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </div>
</template>

<script lang="ts">
import axios from "axios";
import { Vue, prop, Options } from "vue-class-component";
import { shell } from "electron";

interface PopupData {
    version: number;
    title: string;
    description: string;
    links: { [url: string]: string };
}

class Props {

}
type Nullable<t> = t | null

@Options({

})
export default class NotificationPopup extends Vue.with(Props) {
  pData: Nullable<PopupData> = null;
  get showPopup () {
    return !!this.pData && this.pData.version > this.$store.state.popupVersion;
  }

  mounted (): void {
    this.fetch();
  }

  async fetch () {
    const request = await axios.get<PopupData>("https://linka.su/looks.popup.json");
    console.log(request.data);

    this.pData = request.data;
  }

  closePopup () {
    this.$store.commit("popupVersion", this.pData?.version ?? 0);
  }

  openLink (url: string) {
    shell.openExternal(url);
  }
}
</script>
