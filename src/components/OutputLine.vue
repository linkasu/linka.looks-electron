<template>
  <v-layout full-height class="output-line">
    <eye-button>
      <v-icon> mdi-lock </v-icon>
    </eye-button>
    <eye-button class="output-block">
      <v-icon block class="speaker-icon">mdi-speaker</v-icon>
      <div class="output-text" ref="text">
        <div class="text" v-if="withoutSpace">{{ text }}</div>
      </div>
    </eye-button>
    <eye-button @click="backspace">
      <v-icon> mdi-backspace </v-icon>
    </eye-button>
    <eye-button @click="clear">
      <v-icon> mdi-delete </v-icon>
    </eye-button>
  </v-layout>
</template>

<script lang="ts">
import { Vue, Options, prop } from "vue-class-component";
import EyeButton from "@/components/EyeButton.vue";
import { Card, ConfigFile } from "@/interfaces/ConfigFile";
import { Config } from "electron";

class Props {
  file: string = prop({
    required: true,
  });
  cards: Card[] = prop({
    required: true,
  });
  config: ConfigFile = prop({
    required: true,
  });
}
@Options({
  components: {
    EyeButton,
  },
})
export default class OutpuiLine extends Vue.with(Props) {
  get withoutSpace() {
    return this.config?.withoutSpace;
  }
  get text() {
    //    return 'longlonglonglonglonglonglonglonglonglonglonglonglonglonglonglonglong'
    return this.clone
      .map((c) => {
        return c.cardType == 0 ? c.title : " ";
      })
      .join("");
  }
  get clone() {
    this.scrollEnd();

    return [...this.cards];
  }
  scrollEnd() {
    setTimeout(() => {
      const el = this.$refs.text as HTMLButtonElement;
      console.log(el);

      el.scrollTo({
        left: el.offsetWidth,
      });
    }, 0);
  }

  clear() {
    this.$emit("value", []);
  }

  backspace() {
    this.$emit("value", this.clone.slice(0, -1));
  }
}
</script>

<style scoped>
.output-line {
  height: 150px;
  display: grid;
  grid-template-columns: 1fr 7fr 1fr 1fr;
  gap: 4px;
}

.text {
  margin-top: 22.5px;
  font-size: 60px;
  vertical-align: middle;
  text-align: left;
}
.output-text {
  display: block;
  width: 100%;
  height: 100%;
  overflow-x: scroll;
}

.output-block {
  display: grid;
  grid-template-columns: 1fr 6fr;
  overflow: hidden;
}
.speaker-icon {
  width: 100%;
  height: 100%;
}
</style>
