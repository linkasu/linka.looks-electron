<template>
  <button
    class="eyebtn"
    :class="{ eye: enabled, isInside }"
    :style="{ background: `rgb(var(--v-theme-${color}))`, borderWidth }"
    @click="click()"
  >
    <slot />
    <div
      class="overlay"
      v-if="isInside || (!buttonEnabled && !lock)"
      :class="{ disabled: !buttonEnabled && !lock }"
    >
      <div
        v-if="circle"
        class="progress-bar"
        :style="{ '--seconds': seconds, '--size': size }"
      >
        <progress
          min="0"
          :max="buttonTimeout"
          style="visibility: hidden; height: 0; width: 0"
        ></progress>
      </div>
    </div>
  </button>
</template>

<script lang="ts">
import { toHandlers } from "vue";
import { Vue, Options, prop } from "vue-class-component";

class Props {
  enabled = prop({
    default: true,
  });
  lock = prop({
    default: false,
  });
  color = prop({
    required: false,
  });
  path = prop({
    default: false,
  });
}

@Options({
  components: {},
})
export default class EyeButton extends Vue.with(Props) {
  isInside = false;
  countOfClicks = 0;
  circle = false;
timer?: NodeJS.Timeout;
  get borderWidth() {
    return this.$store.state.button.borders + "px";
  }
  get buttonTimeout(): number {
    return this.$store.state.button.timeout;
  }

  mounted() {
    const el = this.$el as Element;
    el.addEventListener("eye-enter", () => {
      if (this.buttonEnabled || this.lock) this.onEnter();
    });
    el.addEventListener("eye-exit", () => {
      
      this.onExit();
    });
    el.addEventListener("eye-stay", (event) => {
      if (this.buttonEnabled || this.lock)
        this.onStay((event as CustomEvent).detail.time);
    });
  }
  onStay(time: number) {
    this.circle = true;
    if(this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      console.log('timeout');
      
      this.onExit()
    }, 100);
    if (!this.$store.state.button.eyeActivation) return;
    const stayCount = Math.floor(time / this.buttonTimeout);

    if (this.countOfClicks < stayCount) {
      (this.$el as HTMLButtonElement).dispatchEvent(new Event("click"));
     
      this.countOfClicks = stayCount;
    }
  }
  onExit() {
    this.isInside = false;
    this.circle = false;
    
    
  }
  onEnter() {
    this.timer = setTimeout(() => {
      console.log('timeout');
      
      this.onExit()
    }, 100);
    if (!this.$store.state.button.eyeSelect) return;
    this.isInside = true;
    this.countOfClicks = 0;
  }

  get buttonEnabled() {
    return this.$store.state.button.enabled;
  }

  get size() {
    if (!this.$el) return 0 + "px";
    const rect = (this.$el as HTMLButtonElement).getBoundingClientRect();
    return Math.min(rect.width, rect.height) * 0.8 + "px";
  }

  public get seconds(): string {
    return this.buttonTimeout / 1000 + "s";
  }
  click() {
    if(!this.$store.state.button.clickSound) return;
    const el = document.getElementById('button_audio') as HTMLAudioElement
    el.pause()
    el.currentTime = 0
    el.play()
  }

}
</script>

<style scoped>
.overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.05);
}

.disabled {
  background: rgba(0, 0, 0, 0.5);
}

.eyebtn {
  position: relative;
  border: 1px solid rgb(var(--v-theme-secondary));
  overflow: hidden;
  width: 100%;
  height: 100%;
}
.isInside {
  background-color: rgb(var(--v-theme-secondary)) !important;
}

canvas {
  position: absolute;
  left: 0;
  top: 0;
}
@property --progress-value {
  syntax: "<integer>";
  initial-value: 0;
  inherits: false;
}

@keyframes progress {
  to {
    --progress-value: 100;
  }
}

.progress-bar {
  display: flex;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  justify-content: center;
  align-items: center;

  width: var(--size);
  height: var(--size);
  border-radius: 50%;
  background: radial-gradient(
      closest-side,
      transparent 79%,
      transparent 80% 100%
    ),
    conic-gradient(
      rgba(var(--v-theme-primary), 0.5) calc(var(--progress-value) * 1%),
      transparent 0
    );
  animation: progress 1s infinite forwards;
  animation-duration: var(--seconds);
  animation-timing-function: linear;
}
</style>
