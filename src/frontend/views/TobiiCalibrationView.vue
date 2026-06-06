<template>
  <div class="tobii-calibration">
    <v-container v-if="!calibrationActive" class="panel-container">
      <v-card>
        <v-card-title>
          Калибровка Tobii Eye Tracker 5
        </v-card-title>
        <v-card-text>
          Смотрите на любую доступную точку и удерживайте взгляд, пока она не сработает. Если отвести взгляд раньше времени, точка вернётся в исходное состояние. Для отмены нажмите Escape.
          <v-alert class="mt-4" :type="tobiiStatusAlertType" variant="tonal">
            <div>{{ tobiiStatusMessage }}</div>
            <div v-if="tobiiStatus?.lastError">
              Ошибка: {{ tobiiStatus.lastError }}
            </div>
          </v-alert>
          <v-alert v-if="calibrationMessage" class="mt-4" type="info" variant="tonal">
            {{ calibrationMessage }}
          </v-alert>
          <v-alert v-if="calibrationError" class="mt-4" type="error" variant="tonal">
            {{ calibrationError }}
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-btn color="primary" :disabled="!canUseTobii" :loading="calibrationBusy" @click="startTobiiCalibration">
            Начать калибровку
          </v-btn>
          <v-btn :disabled="!canUseTobii" :loading="calibrationBusy" @click="applySavedCalibration">
            Применить сохранённую
          </v-btn>
          <v-spacer></v-spacer>
          <v-btn @click="router.back()">
            Назад
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-container>

    <div v-else class="calibration-stage" :class="{ 'is-finishing': phase === 'finish' }">
      <div v-if="showDebug && debugState" class="debug-gaze-marker" :style="debugMarkerStyle"></div>
      <div
        v-for="(point, index) in currentGroup"
        v-if="pointStates[index] !== 'done'"
        :key="`${activeGroupIndex}-${index}`"
        class="calibration-target eye lock"
        :class="targetClasses(index)"
        :data-eye-disabled="isPointEyeDisabled(index) ? '1' : null"
        :style="targetStyle(point, index)"
        @eye-enter="onPointEnter(index)"
        @eye-exit="onPointExit(index)"
        @click.prevent
      >
        <div class="target-sparks" aria-hidden="true">
          <span v-for="spark in 10" :key="spark" class="target-spark"></span>
        </div>
        <div class="target-ring">
          <div class="target-dot"></div>
        </div>
      </div>

      <v-card v-if="showDebug" class="debug-panel" density="compact">
        <v-card-title class="text-subtitle-2">
          Tobii debug
        </v-card-title>
        <v-card-text>
          <div>phase: {{ phase }} group: {{ activeGroupIndex + 1 }} active: {{ activePointIndex ?? '-' }}</div>
          <div>states: {{ pointStates.join(', ') }}</div>
          <div v-if="debugState">
            raw: {{ formatPoint(debugState.raw) }} normalized: {{ formatPoint(debugState.normalized) }}
          </div>
          <div v-if="debugState">
            screen: {{ formatPoint(debugState.screen) }} viewport: {{ formatPoint(debugViewportPoint) }} hit: {{ debugState.hitIndex }} / {{ debugState.boundsCount }} sw: {{ debugState.softwareCalibration ? 'on' : 'off' }}
          </div>
          <div v-if="debugTargets.length">
            targets: {{ debugTargets.join(' | ') }}
          </div>
        </v-card-text>
      </v-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ipcRenderer, type IpcRendererEvent } from "electron";
import store from "@/frontend/store";
import { platform } from "@/frontend/plugins/platform";
import { Metric } from "@/frontend/utils/Metric";
import type { TobiiStatus } from "@/electron/tobii/EyeTrackerProcess";

type CalibrationPhase = "idle" | "start" | "look" | "finish";
type CalibrationPointState = "idle" | "holding" | "bursting" | "done";
type CalibrationPoint = {
  x: number
  y: number
};
type TobiiDebugState = {
  raw: CalibrationPoint
  normalized: CalibrationPoint
  screen: CalibrationPoint
  screenRect: { x: number, y: number, width: number, height: number }
  boundsCount: number
  hitIndex: number
  softwareCalibration: boolean
};

const router = useRouter();
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
const burstMs = 280;
const groupPauseMs = 120;
let holdFrame: number | undefined;

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
const canUseTobii = computed(() => tobiiStatus.value?.state === "connected" || tobiiStatus.value?.state === "tracking");
const tobiiStatusMessage = computed(() => tobiiStatus.value?.message || "Проверяю состояние Tobii...");
const tobiiStatusAlertType = computed(() => {
  if (!tobiiStatus.value) return "info";
  if (canUseTobii.value) return "success";
  if (tobiiStatus.value.state === "waiting_device" || tobiiStatus.value.state === "connecting" || tobiiStatus.value.state === "reconnecting" || tobiiStatus.value.state === "service_starting") return "warning";
  return "error";
});

async function startTobiiCalibration () {
  if (calibrationBusy.value) return;
  trackTobiiMetric("tobiiCalibrationStart", { platform: platform.name });
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
  } catch (error) {
    failCalibration(error);
  }
}

function cancelTobiiCalibration () {
  const cancelledPhase = phase.value;
  stopHoldTimer();
  cancelled.value = true;
  calibrationActive.value = false;
  calibrationBusy.value = false;
  phase.value = "idle";
  activePointIndex.value = null;
  completingPoint.value = false;
  calibrationMessage.value = "Калибровка Tobii отменена.";
  trackTobiiMetric("tobiiCalibrationCancel", { phase: cancelledPhase, platform: platform.name });
}

async function applySavedCalibration () {
  calibrationBusy.value = true;
  calibrationError.value = "";
  trackTobiiMetric("tobiiCalibrationApplySaved", { platform: platform.name });
  try {
    const applied = await ipcRenderer.invoke("tobii:calibration:apply-saved");
    calibrationMessage.value = applied ? "Сохранённая калибровка применена." : "Сохранённая калибровка пока не найдена.";
    trackTobiiMetric("tobiiCalibrationApplySavedResult", { applied, platform: platform.name });
  } catch (error) {
    calibrationError.value = error instanceof Error ? error.message : String(error);
    trackTobiiMetric("tobiiCalibrationError", { action: "applySaved", message: calibrationError.value, platform: platform.name });
  } finally {
    calibrationBusy.value = false;
  }
}

function targetStyle (point: CalibrationPoint, index: number) {
  const progress = activePointIndex.value === index ? holdProgress.value : 0;
  return {
    left: `${point.x * 100}%`,
    top: `${point.y * 100}%`,
    "--hold-progress": `${progress}%`
  };
}

function targetClasses (index: number) {
  const state = pointStates.value[index] || "idle";
  return {
    [`is-${state}`]: true,
    "is-active": activePointIndex.value === index,
    "is-disabled": isPointEyeDisabled(index)
  };
}

function isPointEyeDisabled (index: number) {
  if (phase.value !== "look") return true;
  if (completingPoint.value) return true;
  const state = pointStates.value[index];
  if (state === "done" || state === "bursting") return true;
  return activePointIndex.value !== null && activePointIndex.value !== index;
}

function onPointEnter (index: number) {
  if (isPointEyeDisabled(index)) return;
  if (pointStates.value[index] === "holding") return;
  stopHoldTimer();
  activePointIndex.value = index;
  holdProgress.value = 0;
  setPointState(index, "holding");
  startHoldTimer(index);
}

function onPointExit (index: number) {
  if (activePointIndex.value !== index) return;
  if (pointStates.value[index] !== "holding") return;
  stopHoldTimer();
  activePointIndex.value = null;
  holdProgress.value = 0;
  setPointState(index, "idle");
}

function startHoldTimer (index: number) {
  const startedAt = performance.now();
  const tick = (now: number) => {
    if (cancelled.value || activePointIndex.value !== index || pointStates.value[index] !== "holding") return;
    const elapsed = now - startedAt;
    holdProgress.value = Math.min(100, elapsed / holdMs * 100);
    if (elapsed >= holdMs) {
      void completePoint(index);
      return;
    }
    holdFrame = window.requestAnimationFrame(tick);
  };
  holdFrame = window.requestAnimationFrame(tick);
}

async function completePoint (index: number) {
  if (completingPoint.value) return;
  completingPoint.value = true;
  stopHoldTimer();
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
    trackTobiiMetric("tobiiCalibrationPoint", {
      group: activeGroupIndex.value + 1,
      index: index + 1,
      platform: platform.name
    });
    completingPoint.value = false;
    await continueAfterPoint();
  } catch (error) {
    failCalibration(error);
  }
}

async function continueAfterPoint () {
  if (!pointStates.value.every((state) => state === "done")) return;
  if (activeGroupIndex.value < calibrationGroups.length - 1) {
    await wait(groupPauseMs);
    if (cancelled.value) return;
    activeGroupIndex.value += 1;
    resetPointStates();
    return;
  }

  phase.value = "finish";
  try {
    await ipcRenderer.invoke("tobii:calibration:finish");
    calibrationMessage.value = "Калибровка Tobii сохранена и применена.";
    trackTobiiMetric("tobiiCalibrationFinish", { platform: platform.name });
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

function resetPointStates () {
  pointStates.value = currentGroup.value.map(() => "idle");
}

function setPointState (index: number, state: CalibrationPointState) {
  pointStates.value = pointStates.value.map((current, currentIndex) => currentIndex === index ? state : current);
}

function stopHoldTimer () {
  if (holdFrame === undefined) return;
  window.cancelAnimationFrame(holdFrame);
  holdFrame = undefined;
}

function failCalibration (error: unknown) {
  stopHoldTimer();
  calibrationError.value = error instanceof Error ? error.message : String(error);
  trackTobiiMetric("tobiiCalibrationError", {
    phase: phase.value,
    message: calibrationError.value,
    platform: platform.name
  });
  calibrationActive.value = false;
  calibrationBusy.value = false;
  completingPoint.value = false;
  activePointIndex.value = null;
  phase.value = "idle";
}

function wait (durationMs: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, durationMs));
}

function onKeydown (event: KeyboardEvent) {
  if (!calibrationActive.value || event.key !== "Escape") return;
  event.preventDefault();
  cancelTobiiCalibration();
}

function onTobiiDebug (event: IpcRendererEvent, state: TobiiDebugState) {
  debugState.value = state;
  debugTargets.value = currentGroup.value.map((point, index) => {
    const el = document.querySelectorAll(".calibration-target")[index];
    const rect = el?.getBoundingClientRect();
    const target = `${index}:${pointStates.value[index] || "?"}`;
    if (!rect) return target;
    return `${target}@${Math.round(rect.x + rect.width / 2)},${Math.round(rect.y + rect.height / 2)} ${Math.round(rect.width)}x${Math.round(rect.height)}`;
  });
}

function onTobiiStatus (event: IpcRendererEvent, status: TobiiStatus) {
  tobiiStatus.value = status;
}

async function loadTobiiStatus () {
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

function formatPoint (point: CalibrationPoint) {
  return `${point.x.toFixed(3)}, ${point.y.toFixed(3)}`;
}

function trackTobiiMetric (eventName: Parameters<typeof Metric.registerEvent>[1], eventData?: unknown) {
  Metric.registerEvent(store.state.pcHash, eventName, eventData);
}

onMounted(() => {
  if (!platform.isMacOS) {
    trackTobiiMetric("tobiiCalibrationUnavailable", { platform: platform.name });
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

.calibration-stage {
  position: fixed;
  inset: 0;
  z-index: 1000;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 45%, rgba(42, 101, 255, 0.24) 0%, rgba(6, 17, 45, 0.92) 45%, #020817 100%),
    #020817;
  color: #fff;
  transition: opacity 240ms ease;
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
  transition: opacity 180ms ease, transform 180ms ease, filter 180ms ease;
}

.calibration-target.is-disabled:not(.is-holding):not(.is-bursting) {
  opacity: 0.36;
}

.calibration-target.is-done {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.7);
  pointer-events: none;
}

.target-ring {
  position: relative;
  width: 76px;
  height: 76px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: conic-gradient(
    #4dffea var(--hold-progress),
    rgba(77, 255, 234, 0.26) 0
  );
  box-shadow:
    0 0 28px rgba(77, 255, 234, 0.7),
    0 0 76px rgba(54, 116, 255, 0.38);
}

.target-ring::before {
  content: "";
  position: absolute;
  inset: 10px;
  border-radius: 50%;
  background: #04122e;
  box-shadow: inset 0 0 18px rgba(77, 255, 234, 0.18);
}

.is-holding .target-ring {
  animation: target-spin 720ms linear infinite;
}

.is-bursting .target-ring {
  animation: target-burst 280ms ease-out forwards;
}

.target-dot {
  position: relative;
  z-index: 1;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #ffec5c;
  box-shadow:
    0 0 0 8px rgba(255, 236, 92, 0.22),
    0 0 24px rgba(255, 236, 92, 0.9);
}

.is-bursting .target-dot {
  animation: dot-burst 280ms ease-out forwards;
}

.target-sparks {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.target-spark {
  --spark-distance: 42px;
  position: absolute;
  top: 50%;
  left: 50%;
  width: 7px;
  height: 7px;
  margin: -3.5px 0 0 -3.5px;
  border-radius: 50%;
  background: #ffec5c;
  opacity: 0;
  transform: rotate(var(--spark-angle)) translateX(24px) scale(0.4);
  box-shadow: 0 0 14px rgba(255, 236, 92, 0.95);
}

.is-holding .target-spark {
  animation: spark-orbit 720ms linear infinite;
}

.is-bursting .target-spark {
  animation: spark-burst 280ms ease-out forwards;
}

.target-spark:nth-child(1) { --spark-angle: 0deg; }
.target-spark:nth-child(2) { --spark-angle: 36deg; }
.target-spark:nth-child(3) { --spark-angle: 72deg; }
.target-spark:nth-child(4) { --spark-angle: 108deg; }
.target-spark:nth-child(5) { --spark-angle: 144deg; }
.target-spark:nth-child(6) { --spark-angle: 180deg; }
.target-spark:nth-child(7) { --spark-angle: 216deg; }
.target-spark:nth-child(8) { --spark-angle: 252deg; }
.target-spark:nth-child(9) { --spark-angle: 288deg; }
.target-spark:nth-child(10) { --spark-angle: 324deg; }

@keyframes target-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes target-burst {
  0% {
    opacity: 1;
    transform: scale(1);
  }
  70% {
    opacity: 0.85;
    transform: scale(1.5);
  }
  100% {
    opacity: 0;
    transform: scale(2.1);
  }
}

@keyframes dot-burst {
  to {
    opacity: 0;
    transform: scale(0.2);
  }
}

@keyframes spark-orbit {
  0% {
    opacity: 0.25;
    transform: rotate(var(--spark-angle)) translateX(22px) scale(0.35);
  }
  50% {
    opacity: 1;
    transform: rotate(calc(var(--spark-angle) + 180deg)) translateX(34px) scale(0.8);
  }
  100% {
    opacity: 0.25;
    transform: rotate(calc(var(--spark-angle) + 360deg)) translateX(22px) scale(0.35);
  }
}

@keyframes spark-burst {
  0% {
    opacity: 1;
    transform: rotate(var(--spark-angle)) translateX(28px) scale(0.7);
  }
  100% {
    opacity: 0;
    transform: rotate(var(--spark-angle)) translateX(74px) scale(0.15);
  }
}
</style>
