<template>
  <section aria-labelledby="settings-system-interaction" class="mt-4">
    <h2 id="settings-system-interaction" class="text-subtitle-1 mb-2">Взаимодействие с системой</h2>
    <p v-if="!supported">Точка взгляда доступна только в Windows.</p>
    <template v-else>
      <v-checkbox
        :model-value="preferences.enabled"
        :disabled="disabled"
        label="Показывать точку взгляда"
        hide-details
        @update:model-value="change({ enabled: $event === true })"
      />
      <p role="status" data-testid="bubble-status">
        Сохранено: {{ snapshot ? (preferences.enabled ? "включено" : "выключено") : "неизвестно" }}.
        Отображение: {{ snapshot?.displayed ? "точка видна" : "точка скрыта" }}. Подключение:
        {{ connection }}.
      </p>
      <p v-if="error || snapshot?.errorCode" role="alert">
        {{ error || agentError }}
      </p>
      <v-btn
        v-if="!snapshot || snapshot.errorCode === 'AGENT_STOPPED'"
        :disabled="busy"
        variant="outlined"
        @click="loadState(true)"
        >Подключить Bubble</v-btn
      >
      <v-slider
        v-for="control in controls"
        :key="control.key"
        :model-value="draft[control.key] ?? preferences[control.key]"
        :disabled="disabled"
        :label="control.label"
        :aria-label="control.label"
        :min="control.min"
        :max="control.max"
        :step="1"
        thumb-label
        @update:model-value="queue(control.key, $event)"
      />
      <v-btn :disabled="disabled" variant="outlined" @click="resetAppearance">
        Сбросить оформление
      </v-btn>
      <v-btn
        v-if="
          snapshot?.preferences.enabled &&
          snapshot.errorCode &&
          snapshot.errorCode !== 'AGENT_STOPPED'
        "
        :disabled="disabled"
        variant="text"
        @click="change({ enabled: true })"
        >Повторить подключение</v-btn
      >
    </template>
    <p class="text-caption text-medium-emphasis mt-2">
      Точка приблизительно показывает направление внимания, а не чтение или понимание текста.
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";
import { ipcRenderer } from "electron";
import { platform, type PlatformHelper } from "@/frontend/plugins/platform";
import {
  DEFAULT_BUBBLE_PREFERENCES,
  type BubblePreferences,
  type BubbleResult,
  type BubbleSnapshot
} from "@/common/bubble/contract";

type AppearanceKey = "diameter" | "brightness" | "smoothness";
const supported = inject<PlatformHelper>("platform", platform).isWindows;
const snapshot = ref<BubbleSnapshot>();
const busy = ref(false);
const error = ref("");
const draft = ref<Partial<Pick<BubblePreferences, AppearanceKey>>>({});
const preferences = computed(() => snapshot.value?.preferences ?? DEFAULT_BUBBLE_PREFERENCES);
const disabled = computed(() => busy.value || !snapshot.value);
const agentError = computed(() => {
  const messages: Record<string, string> = {
    LEGACY_CONFLICT:
      "Уже работает отдельный Bubble. Завершите его через трей и повторите подключение.",
    BACKEND_MISSING: "Не найден компонент Tobii. Повторите установку «Смотри».",
    SDK_UNAVAILABLE: "Не удалось подключиться к Tobii. Проверьте трекер и фирменное ПО.",
    SETTINGS_UNREADABLE: "Не удалось прочитать настройки. Исходный файл сохранён без изменений.",
    AGENT_STOPPED: "Bubble завершён. Для нового сеанса нажмите «Подключить Bubble».",
    BACKEND_STOP_TIMEOUT: "Компонент Tobii не завершился. Закройте Bubble перед повторным запуском."
  };
  return (
    messages[snapshot.value?.errorCode || ""] ||
    "Компонент Bubble недоступен. Проверьте подключение Tobii."
  );
});
const controls: { key: AppearanceKey; label: string; min: number; max: number }[] = [
  { key: "diameter", label: "Размер точки", min: 20, max: 100 },
  { key: "brightness", label: "Яркость точки", min: 10, max: 100 },
  { key: "smoothness", label: "Плавность движения", min: 0, max: 100 }
];
const connection = computed(() => {
  if (!snapshot.value) return "состояние недоступно";
  const labels = {
    "not-requested": "не запрошено",
    connecting: "подключение",
    tracking: "данные поступают",
    stale: "нет свежего взгляда",
    unavailable: "недоступно",
    "legacy-conflict": "конфликт с отдельным приложением точки"
  };
  return labels[snapshot.value.tracker];
});
let timer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;
let mounted = false;
const retiredInstances = new Set<string>();

function clearDraft() {
  clearTimeout(timer);
  timer = undefined;
  draft.value = {};
}

function accept(state: BubbleSnapshot) {
  if (!mounted || retiredInstances.has(state.instanceId)) return;
  const current = snapshot.value;
  if (
    current?.instanceId === state.instanceId &&
    (state.stateSequence < current.stateSequence ||
      (state.stateSequence === current.stateSequence &&
        state.errorCode !== "AGENT_STOPPED" &&
        current.errorCode !== "AGENT_STOPPED"))
  )
    return;
  if (current && current.instanceId !== state.instanceId) retiredInstances.add(current.instanceId);
  snapshot.value = state;
  if (
    !current ||
    current.instanceId !== state.instanceId ||
    current.revision !== state.revision ||
    state.errorCode === "AGENT_STOPPED"
  )
    clearDraft();
}

function onState(_event: unknown, state: BubbleSnapshot) {
  generation += 1;
  accept(state);
}

async function change(patch: Partial<BubblePreferences>) {
  if (!supported || busy.value || !snapshot.value) return;
  clearDraft();
  busy.value = true;
  error.value = "";
  const requestGeneration = generation;
  const { instanceId, revision } = snapshot.value;
  try {
    const result: BubbleResult = await ipcRenderer.invoke("bubble:change", {
      instanceId,
      revision,
      patch
    });
    if (!mounted) return;
    if (
      result.state &&
      (requestGeneration === generation ||
        (result.state.instanceId === snapshot.value?.instanceId &&
          result.state.stateSequence > snapshot.value.stateSequence))
    ) {
      accept(result.state);
    }
    if (!result.ok)
      error.value =
        result.code === "CONFLICT"
          ? "Настройки изменены в другом месте. Проверьте значения и повторите действие."
          : `Не удалось сохранить настройки${result.code ? `: ${result.code}` : ""}.`;
  } catch {
    if (mounted) error.value = "Агент недоступен. Настройки не сохранены.";
  } finally {
    busy.value = false;
  }
}

function queue(key: AppearanceKey, value: number) {
  if (disabled.value) return;
  // A slider sends only its final value, never a stream of writes.
  clearTimeout(timer);
  draft.value = { [key]: value };
  timer = setTimeout(() => void change({ [key]: value }), 120);
}

function resetAppearance() {
  const { diameter, brightness, smoothness } = DEFAULT_BUBBLE_PREFERENCES;
  void change({ diameter, brightness, smoothness });
}

async function loadState(restart = false) {
  const requestGeneration = generation;
  try {
    const result: BubbleResult = await ipcRenderer.invoke(
      restart ? "bubble:restart" : "bubble:getState"
    );
    if (!mounted || requestGeneration !== generation) return;
    if (result.state) accept(result.state);
    error.value = result.ok ? "" : "Не удалось получить состояние агента.";
  } catch {
    if (mounted) error.value = "Агент недоступен.";
  }
}

onMounted(() => {
  mounted = true;
  if (!supported) return;
  ipcRenderer.on("bubble:state", onState);
  void loadState();
});

onBeforeUnmount(() => {
  mounted = false;
  clearDraft();
  if (supported) ipcRenderer.removeListener("bubble:state", onState);
});
</script>
