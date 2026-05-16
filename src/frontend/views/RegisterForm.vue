<template>
  <v-dialog
    :model-value="true"
    persistent
    max-width="600px"
    min-width="360px"
  >
    <v-alert
      v-if="error"
      color="error"
    >
      {{ error }}
    </v-alert>
    <v-card v-if="step == 0">
      <v-card-title primary-title>
        LINKa. смотри. Регистрация.
      </v-card-title>
      <v-card-text>
        Благодарим вас за установку LINKa смотри. Совсем скоро вы сможете использовать программу, но
        для начала введите ваш email. Вы можете использовать один email на разных компьютерах.
      </v-card-text>
      <v-card-text>
        <v-form @submit.prevent="getCode()">
          <v-text-field
            v-model="email"
            label="E-mail"
            type="email"
            required
          />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn :disabled="loading" :loading="loading" @click="getCode()">
          Получить код
        </v-btn>
      </v-card-actions>
    </v-card>
    <v-card v-if="step == 1">
      <v-card-title primary-title>
        Проверка кода
      </v-card-title>
      <v-card-text>
        Мы отправили шестизначный проверолчный код на вашу почту <b>{{ email }}</b>.
      </v-card-text>
      <v-card-text>
        <v-form @submit.prevent="checkCode">
          <v-text-field
            v-model="code"
            label="Код"
            required
            :rules="[(s) => s.length === 6]"
          />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-btn @click="step = 0">
          Указать другой e-mail
        </v-btn>
        <v-spacer />
        <v-btn
          v-if="code.length === 6"
          :disabled="loading"
          :loading="loading"
          @click="checkCode()"
        >
          Проверить код
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import type { Ref } from "vue";
import { ref } from "vue";
import { useStore } from "vuex";
import { Metric } from "../utils/Metric";

const store = useStore();

const step = ref(0);
const code = ref("");
const email: Ref<string> = ref("");
const error: Ref<string> = ref("");
const loading = ref(false);

async function getCode () {
  if (loading.value) return;
  if (!isValidEmail(email.value)) {
    error.value = "Введите корректный email";
    return;
  }
  loading.value = true;
  try {
    await Metric.sendActivationEmail(email.value);
    step.value = 1;
    error.value = "";
  } catch (err) {
    console.error(err);
    error.value = "Не удалось отправить код. Проверьте интернет и попробуйте еще раз.";
  } finally {
    loading.value = false;
  }
}

async function checkCode () {
  if (code.value.length !== 6) return;
  if (loading.value) return;
  loading.value = true;
  try {
    const pcHash = await Metric.activateAccount(email.value, code.value);
    if (pcHash) {
      store.commit("pcHash", pcHash);
    }
  } catch {
    error.value = "Не удалось проверить код. Проверьте код и интернет.";
  } finally {
    loading.value = false;
  }
}

function isValidEmail (value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
</script>
