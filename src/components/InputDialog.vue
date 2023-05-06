<template>
  <v-dialog v-model="dialog" width="auto" @show="dialog = true">
    <template v-slot:activator="{ props }" v-if="buttonText || icon">
      <v-btn v-bind="props" :block="!!!icon" :icon="icon" :flat="!!icon">
        {{ buttonText }} <v-icon v-if="icon">{{ icon }}</v-icon></v-btn
      >
    </template>

    <v-card min-width="300px">
      <v-card-title primary-title> {{ title }} </v-card-title>
      <v-card-text>
        <v-form @submit.prevent="submit()">
          <v-text-field
            :label="label"
            v-model="text"
            :rules="[isValid]"
          ></v-text-field>
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-btn color="primary" @click="submit()">
          {{ comfirmText }}
        </v-btn>
        <v-btn color="primary" @click="dialog = false" v-if="cancelText">
          {{ cancelText }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
import { Vue, prop, Options } from "vue-class-component";
import isValidPath from "is-valid-path";

class Props {
  title: string = prop({
    required: true,
  });
  label: string = prop({
    required: true,
  });
  buttonText?: string = prop({});
  icon?: string = prop({});
  comfirmText: string = prop({
    required: true,
  });
  cancelText?: string = prop({});
  checkFilePath = prop({
    default: false,
  });
}

@Options({
  watch: {
    dialog: "onDialog",
  },
})
export default class CreateFromTextDialog extends Vue.with(Props) {
  dialog = false;
  noCancel = false;
  text = "";

  onDialog(v: boolean) {
    if (!v) {
      if (!this.noCancel) this.$emit("cancel");
      this.noCancel = false;

      this.text = "";
    }
  }
  public show() {
    this.dialog = true;
  }
  async submit() {
    if(this.isValid(this.text)!==true){
      return 
    }
    this.noCancel = true;

    this.$emit("confirm", this.text);

    this.dialog = false;
  }
  isValid(text: string) {
    if(!this.checkFilePath) return true
    if(text.includes('/')||!isValidPath(text)){
      return 'Название содержит спецсимволы'
    }
    return true
  }
}
</script>
