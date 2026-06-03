<template>
  <div class="tobii-calibration">
    <v-container v-if="!calibrationActive" class="panel-container">
      <v-card>
        <v-card-title>
          Калибровка Tobii Eye Tracker 5
        </v-card-title>
        <v-card-text>
          Калибровка пройдёт автоматически: смотрите в центр каждой мишени, пока идёт таймер. Нажимать на точки не нужно.
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

    <div v-else class="calibration-stage">
      <div v-if="currentPoint" class="calibration-target" :style="targetStyle">
        <div class="target-ring">
          <div class="target-dot"></div>
        </div>
      </div>

      <v-card class="calibration-panel" elevation="0">
        <v-card-title>
          {{ phaseTitle }}
        </v-card-title>
        <v-card-text>
          <div v-if="phase !== 'finish'" class="mb-3">
            Точка {{ calibrationIndex + 1 }} из {{ calibrationPoints.length }}
          </div>
          <v-progress-linear
            v-if="phase === 'prepare' || phase === 'look'"
            :model-value="progress"
            color="primary"
            height="10"
            rounded
          />
          <div v-if="phase === 'look'" class="countdown">
            {{ countdownText }}
          </div>
          <div v-if="phase === 'collect'" class="countdown">
            Собираю данные...
          </div>
        </v-card-text>
        <v-card-actions>
          <v-btn :disabled="phase === 'finish'" @click="cancelTobiiCalibration">
            Отмена
          </v-btn>
        </v-card-actions>
      </v-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { ipcRenderer } from "electron";

type CalibrationPhase = "idle" | "prepare" | "look" | "collect" | "finish";

const router = useRouter();
const calibrationBusy = ref(false);
const calibrationActive = ref(false);
const calibrationIndex = ref(0);
const calibrationMessage = ref("");
const calibrationError = ref("");
const phase = ref<CalibrationPhase>("idle");
const progress = ref(0);
const countdownText = ref("");
const cancelled = ref(false);

const prepareMs = 2500;
const pointSettleMs = 1800;

const calibrationPoints = [
  { x: 0.5, y: 0.5 },
  { x: 0.12, y: 0.12 },
  { x: 0.88, y: 0.12 },
  { x: 0.88, y: 0.88 },
  { x: 0.12, y: 0.88 }
];

const currentPoint = computed(() => calibrationPoints[calibrationIndex.value]);

const targetStyle = computed(() => {
  const point = currentPoint.value;
  return {
    left: `${point.x * 100}%`,
    top: `${point.y * 100}%`
  };
});

const phaseTitle = computed(() => {
  if (phase.value === "prepare") return "Приготовьтесь";
  if (phase.value === "look") return "Смотрите в центр мишени";
  if (phase.value === "collect") return "Не отводите взгляд";
  if (phase.value === "finish") return "Сохраняю калибровку";
  return "Калибровка Tobii";
});

async function startTobiiCalibration () {
  if (calibrationBusy.value) return;
  calibrationBusy.value = true;
  calibrationActive.value = true;
  calibrationError.value = "";
  calibrationMessage.value = "";
  cancelled.value = false;

  try {
    phase.value = "prepare";
    await waitWithProgress(prepareMs);
    if (cancelled.value) return;

    await ipcRenderer.invoke("tobii:calibration:start");

    for (let i = 0; i < calibrationPoints.length; i++) {
      calibrationIndex.value = i;
      phase.value = "look";
      await waitWithProgress(pointSettleMs);
      if (cancelled.value) return;

      phase.value = "collect";
      progress.value = 100;
      await ipcRenderer.invoke("tobii:calibration:add-point", calibrationPoints[i]);
      if (cancelled.value) return;
    }

    phase.value = "finish";
    await ipcRenderer.invoke("tobii:calibration:finish");
    calibrationMessage.value = "Калибровка Tobii сохранена и применена.";
    calibrationActive.value = false;
    phase.value = "idle";
  } catch (error) {
    calibrationError.value = error instanceof Error ? error.message : String(error);
    calibrationActive.value = false;
    phase.value = "idle";
  } finally {
    calibrationBusy.value = false;
  }
}

function cancelTobiiCalibration () {
  cancelled.value = true;
  calibrationActive.value = false;
  calibrationBusy.value = false;
  phase.value = "idle";
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

function waitWithProgress (durationMs: number) {
  progress.value = 0;
  const startedAt = Date.now();
  return new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      if (cancelled.value) {
        clearInterval(timer);
        resolve();
        return;
      }
      const elapsed = Date.now() - startedAt;
      const left = Math.max(0, durationMs - elapsed);
      progress.value = Math.min(100, elapsed / durationMs * 100);
      countdownText.value = `${Math.ceil(left / 1000)} сек.`;
      if (elapsed >= durationMs) {
        clearInterval(timer);
        progress.value = 100;
        resolve();
      }
    }, 50);
  });
}
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
  background: #fff;
  color: #111;
}

.calibration-target {
  position: fixed;
  transform: translate(-50%, -50%);
}

.target-ring {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 8px solid rgb(var(--v-theme-primary));
  display: grid;
  place-items: center;
}

.target-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgb(var(--v-theme-secondary));
}

.calibration-panel {
  position: fixed;
  left: 50%;
  bottom: 32px;
  transform: translateX(-50%);
  width: min(520px, calc(100vw - 32px));
  background: rgba(255, 255, 255, 0.9);
}

.countdown {
  margin-top: 16px;
  font-size: 28px;
  font-weight: 700;
  text-align: center;
}
</style>
