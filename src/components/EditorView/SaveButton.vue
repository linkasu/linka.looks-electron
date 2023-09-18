<template>
  <v-dialog v-model="dialog" width="auto">
    <template v-slot:activator="{ props }">
      <v-btn flat icon="" v-bind="props">
        <v-icon>mdi-content-save</v-icon>
      </v-btn>
    </template>

    <v-card min-width="300px" v-if="!saveAsNew">
      <v-card-title primary-title> Сохранить {{ title }}? </v-card-title>
      <v-card-text> Вы уверены? </v-card-text>
      <v-card-actions>
        <v-btn
          color="error"
          @click="
            $emit('save');
            dialog = false;
          "
          >Сохранить</v-btn
        >
        <v-btn color="error" @click="saveAsNew = true"
          >Сохранить как новый</v-btn
        >
        <v-btn color="primary" @click="dialog = false">Нет</v-btn>
      </v-card-actions>
    </v-card>
    <v-card min-width="300px" v-else>
      <v-card-title primary-title> Сохранить как новый? </v-card-title>
      <v-card-text>
        <v-text-field v-model="newTitle" suffix=".linka"></v-text-field>
      </v-card-text>
      <v-card-actions>
        <v-btn
          color="error"
          @click="
            if(newTitle) $emit('saveAs', newTitle+'.linka');
            dialog = false;
          "
          >Сохранить</v-btn
        >
        <v-btn color="primary" @click="saveAsNew = false">Нет</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
import { Vue, prop, Options } from "vue-class-component";

class Props {
  title: string = prop({
    required: true
  });
}

@Options({})
export default class DeleteButton extends Vue.with(Props) {
  dialog = false;
  saveAsNew = false;
  newTitle = title.slice(0, -6);
}
</script>
