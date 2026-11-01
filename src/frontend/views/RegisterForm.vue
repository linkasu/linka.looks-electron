<template>
  <v-dialog :model-value="true" persistent max-width="600px" scrollable>
    <v-alert v-if="error" color="error" role="alert">
      {{ error }}
    </v-alert>
    <v-card v-if="step == 0">
      <v-card-title primary-title> Активация LINKa. смотри — шаг 1 из 2 </v-card-title>
      <v-card-text>
        Благодарим вас за установку LINKa смотри. Совсем скоро вы сможете использовать программу, но
        для начала введите ваш email. Вы можете использовать один email на разных компьютерах.
      </v-card-text>
      <v-card-text>
        <v-form @submit.prevent="getCode()">
          <v-text-field
            v-model="email"
            label="Электронная почта"
            type="email"
            autocomplete="email"
            :disabled="loading"
            required
          />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          :disabled="loading || !isValidEmail(email)"
          :loading="loading"
          @click="getCode()"
        >
          Получить код
        </v-btn>
      </v-card-actions>
    </v-card>
    <v-card v-if="step == 1">
      <v-card-title primary-title> Проверка почты — шаг 2 из 2 </v-card-title>
      <v-card-text>
        Мы отправили шестизначный проверочный код на вашу почту <b>{{ email }}</b
        >.
      </v-card-text>
      <v-card-text>
        <v-form @submit.prevent="checkCode">
          <v-text-field
            v-model="code"
            label="Код из письма"
            hint="Введите 6 цифр из письма. Если письма нет, проверьте папку «Спам»."
            persistent-hint
            inputmode="numeric"
            autocomplete="one-time-code"
            :disabled="loading"
            required
            :rules="[(s) => s.length === 6 || 'Код должен содержать 6 символов']"
          />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-btn :disabled="loading" @click="step = 0"> Изменить почту </v-btn>
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          :disabled="loading || code.length !== 6"
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
import { activationService } from "@/frontend/services/ActivationService";

const store = useStore();

const step = ref(0);
const code = ref("");
const email: Ref<string> = ref("");
const error: Ref<string> = ref("");
const loading = ref(false);

async function getCode() {
  if (loading.value) return;
  if (!isValidEmail(email.value)) {
    error.value = "Введите корректный email";
    return;
  }
  loading.value = true;
  try {
    await activationService.sendEmail(email.value);
    step.value = 1;
    error.value = "";
  } catch (err) {
    console.error(err);
    error.value = "Не удалось отправить код. Проверьте интернет и попробуйте еще раз.";
  } finally {
    loading.value = false;
  }
}

async function checkCode() {
  if (code.value.length !== 6) return;
  if (loading.value) return;
  loading.value = true;
  try {
    const pcHash = await activationService.activate(email.value, code.value);
    if (pcHash) {
      store.commit("pcHash", pcHash);
    }
  } catch {
    error.value = "Не удалось проверить код. Проверьте код и интернет.";
  } finally {
    loading.value = false;
  }
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
</script>

<style scoped>
:deep(.v-card-title) {
  white-space: normal;
  overflow-wrap: anywhere;
}
:deep(.v-card-actions) {
  flex-wrap: wrap;
  gap: 8px;
}
</style>
