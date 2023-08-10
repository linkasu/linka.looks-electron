<template>
  <v-dialog v-model="dialog" width="auto">
    <template v-slot:activator="{ props }">
      <v-btn color="error" flat icon="" v-bind="props">
        <v-icon>mdi-delete-forever</v-icon>
      </v-btn>
    </template>

    <v-card min-width="300px">
      <v-card-title primary-title> Удалить {{file}}? </v-card-title>
      <v-card-text> Вы уверены? </v-card-text>
      <v-card-actions>
        <v-btn
          color="error"
          @click="
            $emit('delete');
            dialog = false;
          "
          >Да</v-btn
        >
        <v-btn color="primary" @click="dialog = false">Нет</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
import { Vue, prop, Options } from "vue-class-component";

class Props {
  file: string = prop({
    required: true
  });
}

@Options({})
export default class DeleteButton extends Vue.with(Props) {
  dialog = false;
}
</script>
