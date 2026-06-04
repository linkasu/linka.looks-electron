<template>
  <div class="tobii-calibration">
    <v-container v-if="!calibrationActive" class="panel-container">
      <v-card>
        <v-card-title>
          Калибровка Tobii Eye Tracker 5
        </v-card-title>
        <v-card-text>
          Смотрите на любую доступную точку и удерживайте взгляд, пока она не сработает. Если отвести взгляд раньше времени, точка вернётся в исходное состояние. Для отмены нажмите Escape.
          <v-alert v-if="calibrationMessage" class="mt-4" type="info" variant="tonal">
            {{ calibrationMessage }}
          </v-alert>
          <v-alert v-if="calibrationError" class="mt-4" type="error" variant="tonal">
            {{ calibrationError }}
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-btn color="primary" :loading="calibrationBusy" @click="startTobiiCalibration">
            Начать калибровку
          </v-btn>
          <v-btn :loading="calibrationBusy" @click="applySavedCalibration">
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
      <div
        v-for="(point, index) in currentGroup"
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ipcRenderer } from "electron";

type CalibrationPhase = "idle" | "start" | "look" | "finish";
type CalibrationPointState = "idle" | "holding" | "bursting" | "done";
type CalibrationPoint = {
  x: number
  y: number
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

const holdMs = 1600;
const burstMs = 650;
const groupPauseMs = 500;
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

async function startTobiiCalibration () {
  if (calibrationBusy.value) return;
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
  stopHoldTimer();
  cancelled.value = true;
  calibrationActive.value = false;
  calibrationBusy.value = false;
  phase.value = "idle";
  activePointIndex.value = null;
  completingPoint.value = false;
  calibrationMessage.value = "Калибровка Tobii отменена.";
}

async function applySavedCalibration () {
  calibrationBusy.value = true;
  calibrationError.value = "";
  try {
    const applied = await ipcRenderer.invoke("tobii:calibration:apply-saved");
    calibrationMessage.value = applied ? "Сохранённая калибровка применена." : "Сохранённая калибровка пока не найдена.";
  } catch (error) {
    calibrationError.value = error instanceof Error ? error.message : String(error);
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
    await ipcRenderer.invoke("tobii:calibration:add-point", currentGroup.value[index]);
    if (cancelled.value) return;
    await wait(burstMs);
    if (cancelled.value) return;
    setPointState(index, "done");
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

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => {
  stopHoldTimer();
  window.removeEventListener("keydown", onKeydown);
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
  background: radial-gradient(circle at center, #f9fbff 0%, #edf3ff 52%, #dfe9fb 100%);
  color: #111;
  transition: opacity 240ms ease;
}

.calibration-stage.is-finishing {
  opacity: 0.5;
}

.calibration-target {
  position: fixed;
  width: 132px;
  height: 132px;
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
    rgb(var(--v-theme-primary)) var(--hold-progress),
    rgba(var(--v-theme-primary), 0.22) 0
  );
  box-shadow: 0 18px 44px rgba(32, 64, 128, 0.18);
}

.target-ring::before {
  content: "";
  position: absolute;
  inset: 10px;
  border-radius: 50%;
  background: #fff;
}

.is-holding .target-ring {
  animation: target-spin 720ms linear infinite;
}

.is-bursting .target-ring {
  animation: target-burst 650ms ease-out forwards;
}

.target-dot {
  position: relative;
  z-index: 1;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgb(var(--v-theme-secondary));
  box-shadow: 0 0 0 8px rgba(var(--v-theme-secondary), 0.16);
}

.is-bursting .target-dot {
  animation: dot-burst 650ms ease-out forwards;
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
  background: rgb(var(--v-theme-secondary));
  opacity: 0;
  transform: rotate(var(--spark-angle)) translateX(24px) scale(0.4);
}

.is-holding .target-spark {
  animation: spark-orbit 720ms linear infinite;
}

.is-bursting .target-spark {
  animation: spark-burst 650ms ease-out forwards;
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
