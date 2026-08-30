<template>
  <v-snackbar
    :model-value="showNotice"
    location="top"
    max-width="60rem"
    :timeout="-1"
    @update:model-value="onNoticeChange"
  >
    <div class="font-weight-bold mb-1">Техническая статистика</div>
    <div>
      Помогите улучшать LINKa. смотри, разрешив отправку названий использованных функций и версии
      приложения. Содержимое карточек, названия файлов, пути и тексты ошибок не отправляются.
    </div>
    <template #actions>
      <v-btn data-testid="telemetry-privacy" variant="text" @click="openPrivacy"> Подробнее </v-btn>
      <v-btn data-testid="telemetry-defer" variant="text" @click="defer"> Позже </v-btn>
      <v-btn data-testid="telemetry-disable" variant="text" @click="choose('disabled')">
        Не отправлять
      </v-btn>
      <v-btn
        data-testid="telemetry-enable"
        color="primary"
        variant="flat"
        @click="choose('enabled')"
      >
        Разрешить
      </v-btn>
    </template>
  </v-snackbar>
</template>

<script lang="ts" setup>
import { computed, ref } from "vue";
import { shell } from "electron";
import { useStore } from "vuex";
import type { TelemetryConsent } from "@/frontend/utils/TelemetryConsent";

const store = useStore();
const telemetryConsent = computed(() => store.state.telemetryConsent as TelemetryConsent);
const deferred = ref(false);
const showNotice = computed(() => telemetryConsent.value === "unknown" && !deferred.value);

function choose(consent: Exclude<TelemetryConsent, "unknown">) {
  void store.dispatch("setTelemetryPreference", consent);
}

function defer() {
  deferred.value = true;
}

function onNoticeChange(value: boolean) {
  if (!value) defer();
}

function openPrivacy() {
  shell.openExternal("https://metric.linka.su/privacy");
}
</script>
