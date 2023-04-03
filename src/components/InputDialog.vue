<template>
  <v-dialog v-model="dialog" width="auto" @show="dialog=true">
    <template v-slot:activator="{ props }" v-if="buttonText">
      <v-btn v-bind="props" block> {{ buttonText }} </v-btn>
    </template>

    <v-card min-width="300px">
      <v-card-title primary-title> {{ title }} </v-card-title>
      <v-card-text>
        <v-form
          @submit.prevent="
            $emit('confirm', text);
            dialog = false;
          "
        >
          <v-text-field :label="label" v-model="text"></v-text-field>
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-btn
          color="primary"
          @click="
            $emit('confirm', text);
            dialog = false;
          "
        >
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

class Props {
  title: string = prop({
    required: true,
  });
  label: string = prop({
    required: true,
  });
  buttonText?: string = prop({});
  comfirmText: string = prop({
    required: true,
  });
  cancelText?: string = prop({});
}

@Options({
  watch: {
    dialog: "onDialog",
  },
})
export default class CreateFromTextDialog extends Vue.with(Props) {
  dialog = false;
  text = "";
  
  onDialog(v: boolean) {
    if (!v) {
      this.$emit("cancel");
      this.text = "";
    }
  }
  public show(){
    this.dialog = true;
  }
}
</script>
