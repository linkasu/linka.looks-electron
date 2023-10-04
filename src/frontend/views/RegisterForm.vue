<template>
  <v-dialog :model-value="true" persistent max-width="600px" min-width="360px">
    <v-alert v-if="error" color="error">
      {{ error }}
    </v-alert>
    <v-card>
      <v-card-title primary-title>
        LINKa. смотри. Регистрация.
      </v-card-title>
      <v-tabs v-model="tab">
        <v-tab value="register">Новый аккаунт</v-tab>
        <v-tab value="login">Вход в аккаунт</v-tab>
      </v-tabs>

      <v-card-text>
        <v-window v-model="tab">
          <v-window-item value="register">
            <v-card>
              <v-card-text>
                Благодарим вас за установку LINKa смотри. Совсем скоро вы сможете использовать программу, но
                для вам нужно войти или зарегестрироваться. Регистрация нужна для сбора статистики, а также позже вы
                сможете
                сохранять наборы карточек в своем аккаунте.
              </v-card-text>
              <v-form @submit.prevent="register">
                <v-card-text>

                  <v-text-field type="email" label="E-mail" v-model="email" required></v-text-field>
                  <v-text-field type="password" label="Пароль" v-model="password" required></v-text-field>
                </v-card-text>
                <v-card-actions>
                  <v-spacer></v-spacer>
                  <v-btn type="submit">Зарегестрироваться</v-btn>
                </v-card-actions>
              </v-form>
            </v-card>
          </v-window-item>

          <v-window-item value="login">
            <v-card>
              <v-form @submit.prevent="login">
                <v-card-text>

                  <v-text-field type="email" label="E-mail" v-model="email" required></v-text-field>
                  <v-text-field type="password" label="Пароль" v-model="password" required></v-text-field>
                </v-card-text>
                <v-card-actions>
                  <v-spacer></v-spacer>
                  <v-btn type="submit">Войти</v-btn>
                </v-card-actions>
              </v-form>
            </v-card>
          </v-window-item>

        </v-window>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { ref } from "vue";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { useStore } from "vuex";
import { Metric } from "../utils/Metric";
import { firebaseAuth } from "../utils/firebase";

const store = useStore();
const error = ref();
const tab = ref("register");
const email = ref<string>();
const password = ref<string>();

async function register () {
  if (!email.value || !password.value) {
    return;
  }
  try {
    await createUserWithEmailAndPassword(firebaseAuth, email.value, password.value);
  } catch (e) {
    console.error(e);
    password.value = "";
    error.value = (e as Error).message;
  }
}
async function login () {
  if (!email.value || !password.value) {
    return;
  }
  try {
    await signInWithEmailAndPassword(firebaseAuth, email.value, password.value);
  } catch (e) {
    console.error(e);
    password.value = "";
    error.value = (e as Error).message;
  }
}

</script>
