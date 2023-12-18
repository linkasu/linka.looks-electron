<template>
    <div class="content">
        <v-container grid-list-xs>
            <v-card>
                <v-card-title primary-title>
                    Калибровка масштаба.
                </v-card-title>
                <v-card-text>
                    Пожалуйста, настройте соотношение экрана и его воспринятия айтрекером. <br>
                    Для этого используйте переключатель ниже и смотрите на кнопку с мишенью. Должно совпадать.
                </v-card-text>
                <v-card-text>
                    <v-checkbox label="Учитывать масштабирование экрана?"></v-checkbox>
                </v-card-text>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn to="/">
                        Готово.
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-container>
        <eye-button class="button">
            🎯
        </eye-button>
    </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import EyeButton from "../components/EyeButton.vue";
import store from "../store";

const multiplyScale = computed({
  get () {
    return store.state.button.multiplyScale;
  },
  set (v) {
    store.commit("button_multiply_scale", v);
  }
});

</script>

<style scoped>
.content{
    width: 100%;
    height: 100%;
}

.button{
    width: 10vh;
    height: 10vh;
    bottom: 40px;
    right: 0;
    position: absolute;
}
</style>
