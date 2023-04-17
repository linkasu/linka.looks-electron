<template>
  <v-dialog v-model="dialog" width="auto">
    <template v-slot:activator="{ props }">
      <v-btn flat icon="" v-bind="props">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
    </template>

    <v-card min-width="300px">
      <v-card-title primary-title> Выйти без сохранения? </v-card-title>
      <v-card-text> Вы уверены? </v-card-text>
      <v-card-actions>
        <v-btn
          color="error"
          @click="
            $emit('exit');
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
}

@Options({})
export default class ExitButton extends Vue.with(Props) {
  dialog = false;
}
</script>
