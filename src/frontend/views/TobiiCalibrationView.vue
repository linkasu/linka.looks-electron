<template>
  <div class="tobii-calibration">
    <v-container v-if="!calibrationActive" class="panel-container">
      <v-card>
        <v-card-title> Калибровка Tobii Eye Tracker 5 </v-card-title>
        <v-card-text>
          <v-alert v-if="firstFlow && canUseTobii" class="mb-4" type="info" variant="tonal">
            Tobii подключён. Перед первым использованием выполните калибровку или примените
            сохранённую.
          </v-alert>
          <h2 class="text-subtitle-1 mb-2">Перед началом</h2>
          <ol class="calibration-checklist">
            <li>Подключите Tobii к USB-порту компьютера.</li>
            <li>
              Убедитесь, что устройство найдено:
              <strong data-testid="tobii-device-found">{{
                !tobiiStatus
                  ? "проверяем…"
                  : tobiiStatus.deviceFound
                    ? "найдено"
                    : "пока не найдено"
              }}</strong
              >. Если оно не найдено, проверьте кабель и подключите устройство заново. Приложение
              продолжит поиск автоматически.
            </li>
            <li>
              Закрепите устройство под экраном и сядьте напротив. Расположитесь удобно, чтобы видеть
              весь экран и не менять положение во время калибровки.
            </li>
          </ol>
          <v-alert class="my-4" :type="tobiiStatusAlertType" variant="tonal" role="status">
            <div data-testid="tobii-readiness">{{ tobiiReadiness }}</div>
          </v-alert>
          <details class="calibration-details">
            <summary>Технические сведения о подключении</summary>
            <p>{{ tobiiStatusMessage }}</p>
            <p v-if="tobiiStatus?.lastError">Ошибка: {{ tobiiStatus.lastError }}</p>
          </details>
          <h2 class="text-subtitle-1 mt-4 mb-2">Как проходит калибровка</h2>
          Смотрите в центр выделенной точки. Точки сменяются автоматически в заданном порядке:
          сначала три, затем ещё три. У каждой точки есть время на перевод и удержание взгляда. Если
          отвести взгляд, таймер не остановится. Для отмены нажмите Escape или попросите помощника
          нажать «Отменить».
          <v-alert v-if="calibrationMessage" class="mt-4" type="info" variant="tonal">
            {{ calibrationMessage }}
          </v-alert>
          <v-alert v-if="calibrationError" class="mt-4" type="error" variant="tonal">
            {{ calibrationError }}
          </v-alert>
        </v-card-text>
        <v-card-actions class="calibration-actions">
          <v-btn
            color="primary"
            data-testid="tobii-start-calibration"
            :disabled="!canUseTobii"
            :loading="calibrationBusy"
            @click="startTobiiCalibration"
          >
            Начать калибровку
          </v-btn>
          <v-btn :disabled="!canUseTobii" :loading="calibrationBusy" @click="applySavedCalibration">
            Применить сохранённую
          </v-btn>
          <v-spacer></v-spacer>
          <v-btn v-if="firstFlow" @click="skipFirstTobiiCalibration"> Пропустить </v-btn>
          <v-btn v-else @click="router.back()"> Назад </v-btn>
        </v-card-actions>
      </v-card>
    </v-container>

    <div
      v-else
      class="calibration-stage"
      :class="{ 'is-finishing': phase === 'finish', 'no-animation': !store.state.button.animation }"
    >
      <div class="calibration-toolbar">
        <span role="status">{{
          phase === "start"
            ? "Подготовка…"
            : phase === "finish"
              ? "Сохранение…"
              : `Группа ${activeGroupIndex + 1} из 2 · смотрите в центр выделенной точки`
        }}</span>
        <v-btn variant="outlined" min-height="48" @click="cancelTobiiCalibration"
          >Отменить · Esc</v-btn
        >
      </div>
      <div v-if="showDebug && debugState" class="debug-gaze-marker" :style="debugMarkerStyle"></div>
      <template v-for="(point, index) in currentGroup" :key="`${activeGroupIndex}-${index}`">
        <div
          v-if="pointStates[index] !== 'done'"
          class="calibration-target eye lock"
          :class="targetClasses(index)"
          :data-eye-disabled="isPointEyeDisabled(index) ? '1' : null"
          :style="targetStyle(point, index)"
          @eye-enter="onPointEnter(index)"
          @eye-exit="onPointExit(index)"
          @click.prevent="onPointClick(index)"
        >
          <div class="target-ring">
            <div class="target-dot"></div>
          </div>
        </div>
      </template>

      <v-card v-if="showDebug" class="debug-panel" density="compact">
        <v-card-title class="text-subtitle-2"> Tobii debug </v-card-title>
        <v-card-text>
          <div>
            phase: {{ phase }} group: {{ activeGroupIndex + 1 }} active:
            {{ activePointIndex ?? "-" }}
          </div>
          <div>states: {{ pointStates.join(", ") }}</div>
          <div v-if="debugState">
            raw: {{ formatPoint(debugState.raw) }} normalized:
            {{ formatPoint(debugState.normalized) }}
          </div>
          <div v-if="debugState">
            screen: {{ formatPoint(debugState.screen) }} viewport:
            {{ formatPoint(debugViewportPoint) }} hit: {{ debugState.hitIndex }} /
            {{ debugState.boundsCount }} sw: {{ debugState.softwareCalibration ? "on" : "off" }}
          </div>
          <div v-if="debugTargets.length">targets: {{ debugTargets.join(" | ") }}</div>
        </v-card-text>
      </v-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ipcRenderer, type IpcRendererEvent } from "electron";
import store from "@/frontend/store";
import { platform } from "@/frontend/plugins/platform";
import { Telemetry } from "@/frontend/utils/Telemetry";
import type { TobiiStatus } from "@linkasu/tobii-electron/main";

type CalibrationPhase = "idle" | "start" | "look" | "finish";
type CalibrationPointState = "idle" | "holding" | "bursting" | "done";
type CalibrationPoint = {
  x: number;
  y: number;
};
type TobiiDebugState = {
  raw: CalibrationPoint;
  normalized: CalibrationPoint;
  screen: CalibrationPoint;
  screenRect: { x: number; y: number; width: number; height: number };
  boundsCount: number;
  hitIndex: number;
  softwareCalibration: boolean;
};

const router = useRouter();
const route = useRoute();
const calibrationBusy = ref(false);
const calibrationActive = ref(false);
const calibrationMessage = ref("");
const calibrationError = ref("");
const phase = ref<CalibrationPhase>("idle");
const cancelled = ref(false);
const activeGroupIndex = ref(0);
const activePointIndex = ref<number | null>(null);
const pointStates = ref<CalibrationPointState[]>([]);
const holdProgress = ref(0);
const completingPoint = ref(false);
const debugState = ref<TobiiDebugState>();
const debugTargets = ref<string[]>([]);
const tobiiStatus = ref<TobiiStatus>();
const showDebug = import.meta.env.DEV && window.localStorage.getItem("tobiiDebug") === "1";

const holdMs = 1600;
const settleMs = 800;
const burstMs = 280;
const groupPauseMs = 120;
let holdFrame: number | undefined;
let settleTimer: number | undefined;

const calibrationGroups: CalibrationPoint[][] = [
  [
    { x: 0.5, y: 0.22 },
    { x: 0.24, y: 0.72 },
    { x: 0.76, y: 0.72 }
  ],
  [
    { x: 0.24, y: 0.28 },
    { x: 0.76, y: 0.28 },
    { x: 0.5, y: 0.78 }
  ]
];

const currentGroup = computed(() => calibrationGroups[activeGroupIndex.value]);
const debugViewportPoint = computed(() => {
  if (!debugState.value) return { x: 0, y: 0 };
  return {
    x: debugState.value.screen.x - debugState.value.screenRect.x,
    y: debugState.value.screen.y - debugState.value.screenRect.y
  };
});
const debugMarkerStyle = computed(() => ({
  left: `${debugViewportPoint.value.x}px`,
  top: `${debugViewportPoint.value.y}px`
}));
const canUseTobii = computed(
  () => tobiiStatus.value?.state === "connected" || tobiiStatus.value?.state === "tracking"
);
const firstFlow = computed(() => route.query.first === "1");
const tobiiStatusMessage = computed(
  () => tobiiStatus.value?.message || "Проверяю состояние Tobii..."
);
const tobiiReadiness = computed(() => {
  if (!tobiiStatus.value) return "Проверяем подключение Tobii…";
  if (canUseTobii.value) return "Tobii готов. Можно начать калибровку.";
  if (!tobiiStatus.value.deviceFound)
    return "Tobii пока недоступен. Проверьте подключение по шагам выше.";
  return "Устройство найдено, но подключение ещё не готово. Дождитесь готовности; если статус не меняется, проверьте технические сведения.";
});
const tobiiStatusAlertType = computed(() => {
  if (!tobiiStatus.value) return "info";
  if (canUseTobii.value) return "success";
  if (
    tobiiStatus.value.state === "waiting_device" ||
    tobiiStatus.value.state === "connecting" ||
    tobiiStatus.value.state === "reconnecting" ||
    tobiiStatus.value.state === "service_starting"
  )
    return "warning";
  return "error";
});

async function startTobiiCalibration() {
  if (calibrationBusy.value) return;
  trackTobiiTelemetry("tobiiCalibrationStart");
  calibrationBusy.value = true;
  calibrationActive.value = true;
  calibrationError.value = "";
  calibrationMessage.value = "";
  cancelled.value = false;
  activeGroupIndex.value = 0;
  activePointIndex.value = null;
  holdProgress.value = 0;
  completingPoint.value = false;
  resetPointStates();

  try {
    phase.value = "start";
    await ipcRenderer.invoke("tobii:calibration:start");
    phase.value = "look";
    startNextPointTimer();
  } catch (error) {
    failCalibration(error);
  }
}

function cancelTobiiCalibration() {
  stopHoldTimer();
  stopSettleTimer();
  cancelled.value = true;
  calibrationActive.value = false;
  calibrationBusy.value = false;
  phase.value = "idle";
  activePointIndex.value = null;
  completingPoint.value = false;
  calibrationMessage.value = "Калибровка Tobii отменена.";
  trackTobiiTelemetry("tobiiCalibrationCancel");
  Telemetry.outcome({ kind: "gaze_calibration_completed", result: "cancelled" });
}

async function applySavedCalibration() {
  calibrationBusy.value = true;
  calibrationError.value = "";
  trackTobiiTelemetry("tobiiCalibrationApplySaved");
  try {
    const applied = await ipcRenderer.invoke("tobii:calibration:apply-saved");
    calibrationMessage.value = applied
      ? "Сохранённая калибровка применена."
      : "Сохранённая калибровка пока не найдена.";
    trackTobiiTelemetry("tobiiCalibrationApplySavedResult");
    if (applied && firstFlow.value) finishFirstFlow();
  } catch (error) {
    calibrationError.value = error instanceof Error ? error.message : String(error);
    trackTobiiTelemetry("tobiiCalibrationError");
  } finally {
    calibrationBusy.value = false;
  }
}

function targetStyle(point: CalibrationPoint, index: number) {
  const progress = activePointIndex.value === index ? holdProgress.value : 0;
  return {
    left: `${point.x * 100}%`,
    top: `${point.y * 100}%`,
    "--hold-progress": `${progress}%`
  };
}

function targetClasses(index: number) {
  const state = pointStates.value[index] || "idle";
  return {
    [`is-${state}`]: true,
    "is-active": activePointIndex.value === index,
    "is-disabled": isPointEyeDisabled(index)
  };
}

function isPointEyeDisabled(index: number) {
  if (phase.value !== "look") return true;
  if (completingPoint.value) return true;
  const state = pointStates.value[index];
  if (state === "done" || state === "bursting") return true;
  return activePointIndex.value !== index;
}

function onPointEnter(index: number) {
  if (activePointIndex.value !== null) return;
  if (isPointEyeDisabled(index)) return;
  if (pointStates.value[index] === "holding") return;
  stopHoldTimer();
  stopSettleTimer();
  activePointIndex.value = index;
  holdProgress.value = 0;
  setPointState(index, "holding");
  startHoldTimer(index);
}

function onPointExit(index: number) {
  if (activePointIndex.value !== null) return;
  if (activePointIndex.value !== index) return;
  if (pointStates.value[index] !== "holding") return;
  stopHoldTimer();
  stopSettleTimer();
  activePointIndex.value = null;
  holdProgress.value = 0;
  setPointState(index, "idle");
}

function onPointClick(index: number) {
  if (isPointEyeDisabled(index)) return;
  void completePoint(index);
}

function startHoldTimer(index: number) {
  stopSettleTimer();
  const startedAt = performance.now();
  const tick = (now: number) => {
    if (
      cancelled.value ||
      activePointIndex.value !== index ||
      pointStates.value[index] !== "holding"
    )
      return;
    const elapsed = now - startedAt;
    holdProgress.value = Math.min(100, (elapsed / holdMs) * 100);
    if (elapsed >= holdMs) {
      void completePoint(index);
      return;
    }
    holdFrame = window.requestAnimationFrame(tick);
  };
  holdFrame = window.requestAnimationFrame(tick);
}

function startNextPointTimer() {
  if (cancelled.value || phase.value !== "look" || completingPoint.value) return;
  const index = pointStates.value.findIndex((state) => state === "idle");
  if (index < 0) return;
  stopHoldTimer();
  stopSettleTimer();
  activePointIndex.value = index;
  holdProgress.value = 0;
  setPointState(index, "holding");
  settleTimer = window.setTimeout(() => {
    settleTimer = undefined;
    startHoldTimer(index);
  }, settleMs);
}

async function completePoint(index: number) {
  if (completingPoint.value) return;
  completingPoint.value = true;
  stopHoldTimer();
  stopSettleTimer();
  activePointIndex.value = null;
  holdProgress.value = 100;
  setPointState(index, "bursting");

  try {
    await Promise.all([
      ipcRenderer.invoke("tobii:calibration:add-point", currentGroup.value[index]),
      wait(burstMs)
    ]);
    if (cancelled.value) return;
    setPointState(index, "done");
    trackTobiiTelemetry("tobiiCalibrationPoint");
    completingPoint.value = false;
    await continueAfterPoint();
  } catch (error) {
    failCalibration(error);
  }
}

async function continueAfterPoint() {
  if (!pointStates.value.every((state) => state === "done")) {
    startNextPointTimer();
    return;
  }
  if (activeGroupIndex.value < calibrationGroups.length - 1) {
    await wait(groupPauseMs);
    if (cancelled.value) return;
    activeGroupIndex.value += 1;
    resetPointStates();
    startNextPointTimer();
    return;
  }

  phase.value = "finish";
  try {
    await ipcRenderer.invoke("tobii:calibration:finish");
    calibrationMessage.value = "Калибровка Tobii сохранена и применена.";
    trackTobiiTelemetry("tobiiCalibrationFinish");
    Telemetry.outcome({ kind: "gaze_calibration_completed", result: "completed" });
    if (firstFlow.value) {
      finishFirstFlow();
      return;
    }
    calibrationActive.value = false;
    phase.value = "idle";
  } catch (error) {
    failCalibration(error);
    return;
  } finally {
    calibrationBusy.value = false;
    completingPoint.value = false;
  }
}

function resetPointStates() {
  pointStates.value = currentGroup.value.map(() => "idle");
}

function setPointState(index: number, state: CalibrationPointState) {
  pointStates.value = pointStates.value.map((current, currentIndex) =>
    currentIndex === index ? state : current
  );
}

function stopHoldTimer() {
  if (holdFrame === undefined) return;
  window.cancelAnimationFrame(holdFrame);
  holdFrame = undefined;
}

function stopSettleTimer() {
  if (settleTimer === undefined) return;
  window.clearTimeout(settleTimer);
  settleTimer = undefined;
}

function failCalibration(error: unknown) {
  stopHoldTimer();
  stopSettleTimer();
  calibrationError.value = error instanceof Error ? error.message : String(error);
  trackTobiiTelemetry("tobiiCalibrationError");
  Telemetry.outcome({
    kind: "gaze_calibration_completed",
    result: "failed",
    failure_code: "calibration_failed"
  });
  calibrationActive.value = false;
  calibrationBusy.value = false;
  completingPoint.value = false;
  activePointIndex.value = null;
  phase.value = "idle";
}

function skipFirstTobiiCalibration() {
  trackTobiiTelemetry("tobiiCalibrationCancel");
  Telemetry.outcome({ kind: "gaze_calibration_completed", result: "cancelled" });
  finishFirstFlow();
}

function finishFirstFlow() {
  store.commit("first_calibrate", true);
  calibrationActive.value = false;
  calibrationBusy.value = false;
  phase.value = "idle";
  router.push("/");
}

function wait(durationMs: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, durationMs));
}

function onKeydown(event: KeyboardEvent) {
  if (!calibrationActive.value || event.key !== "Escape") return;
  event.preventDefault();
  cancelTobiiCalibration();
}

function onTobiiDebug(event: IpcRendererEvent, state: TobiiDebugState) {
  debugState.value = state;
  debugTargets.value = currentGroup.value.map((point, index) => {
    const el = document.querySelectorAll(".calibration-target")[index];
    const rect = el?.getBoundingClientRect();
    const target = `${index}:${pointStates.value[index] || "?"}`;
    if (!rect) return target;
    return `${target}@${Math.round(rect.x + rect.width / 2)},${Math.round(rect.y + rect.height / 2)} ${Math.round(rect.width)}x${Math.round(rect.height)}`;
  });
}

function onTobiiStatus(event: IpcRendererEvent, status: TobiiStatus) {
  tobiiStatus.value = status;
}

async function loadTobiiStatus() {
  try {
    tobiiStatus.value = await ipcRenderer.invoke("tobii:status:get");
  } catch (error) {
    tobiiStatus.value = {
      state: "service_unavailable",
      mode: "socket-service",
      message: error instanceof Error ? error.message : String(error),
      deviceFound: false,
      updatedAt: Date.now()
    };
  }
}

function formatPoint(point: CalibrationPoint) {
  return `${point.x.toFixed(3)}, ${point.y.toFixed(3)}`;
}

function trackTobiiTelemetry(
  eventName:
    | "tobiiCalibrationStart"
    | "tobiiCalibrationPoint"
    | "tobiiCalibrationFinish"
    | "tobiiCalibrationCancel"
    | "tobiiCalibrationError"
    | "tobiiCalibrationApplySaved"
    | "tobiiCalibrationApplySavedResult"
    | "tobiiCalibrationUnavailable"
) {
  Telemetry.product(eventName);
}

onMounted(() => {
  if (!platform.isMacOS) {
    trackTobiiTelemetry("tobiiCalibrationUnavailable");
  }
  window.addEventListener("keydown", onKeydown);
  void loadTobiiStatus();
  ipcRenderer.on("tobii:status", onTobiiStatus);
  if (showDebug) {
    ipcRenderer.send("tobii:debug:set-enabled", true);
    ipcRenderer.on("tobii:debug", onTobiiDebug);
  }
});
onBeforeUnmount(() => {
  stopHoldTimer();
  stopSettleTimer();
  window.removeEventListener("keydown", onKeydown);
  ipcRenderer.off("tobii:status", onTobiiStatus);
  if (showDebug) {
    ipcRenderer.send("tobii:debug:set-enabled", false);
    ipcRenderer.off("tobii:debug", onTobiiDebug);
  }
});
</script>

<style scoped>
.tobii-calibration {
  width: 100%;
  height: 100%;
}

.panel-container {
  max-width: 760px;
}
.calibration-checklist {
  padding-left: 24px;
  line-height: 1.6;
}
.calibration-checklist li + li {
  margin-top: 8px;
}
.calibration-details summary {
  min-height: 48px;
  padding-block: 12px;
  cursor: pointer;
  font-weight: 600;
}
.calibration-details p {
  overflow-wrap: anywhere;
}

.calibration-stage {
  position: fixed;
  inset: 0;
  z-index: 1000;
  overflow: hidden;
  background: #152a2d;
  color: #fff;
  transition: opacity 240ms ease;
}

.calibration-actions {
  flex-wrap: wrap;
  gap: 8px;
}
.calibration-actions :deep(.v-btn) {
  min-height: 48px;
}
.calibration-toolbar {
  position: fixed;
  inset: 12px 16px auto;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.875rem;
}

.calibration-stage.is-finishing {
  opacity: 0.5;
}

.debug-panel {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 2;
  max-width: min(720px, calc(100vw - 32px));
  font-family: monospace;
  opacity: 0.88;
}

.debug-gaze-marker {
  position: fixed;
  z-index: 3;
  width: 22px;
  height: 22px;
  transform: translate(-50%, -50%);
  border: 3px solid #f44336;
  border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.9);
  pointer-events: none;
}

.calibration-target {
  position: fixed;
  width: 360px;
  height: 360px;
  transform: translate(-50%, -50%);
  display: grid;
  place-items: center;
  border-radius: 50%;
  pointer-events: auto;
  transition: opacity 180ms ease;
}

.calibration-target.is-disabled:not(.is-holding):not(.is-bursting) {
  opacity: 0.36;
}

.calibration-target.is-done {
  opacity: 0;
  pointer-events: none;
}

.target-ring {
  position: relative;
  width: 76px;
  height: 76px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: conic-gradient(#dcece5 var(--hold-progress), #637b79 0);
}

.target-ring::before {
  content: "";
  position: absolute;
  inset: 10px;
  border-radius: 50%;
  background: #152a2d;
}

.is-active .target-ring {
  outline: 2px solid #fff;
  outline-offset: 6px;
}

.target-dot {
  position: relative;
  z-index: 1;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #ffec5c;
  box-shadow: 0 0 0 4px #152a2d;
}

.no-animation,
.no-animation .calibration-target {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .calibration-stage,
  .calibration-target {
    transition: none;
  }
}
</style>
