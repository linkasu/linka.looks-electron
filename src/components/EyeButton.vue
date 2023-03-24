<template>
  <button class="eye eyebtn">
    <slot />
    <div class="overlay" v-if="isInside">
      <canvas ref="canvas"></canvas>
    </div>
  </button>
</template>

<script lang="ts">
import { Vue, Options } from "vue-class-component";

@Options({
  components: {},
})
export default class EyeButton extends Vue {
  isInside = false;
  countOfClicks = 0;
  get buttonTimeout(): number {
    return this.$store.getters.button_timeout;
  }

  mounted() {
    const el = this.$el as Element;
    el.addEventListener("eye-enter", () => {
      this.onEnter();
    });
    el.addEventListener("eye-exit", () => {
      this.onExit();
    });
    el.addEventListener("eye-stay", (event) => {
      this.onStay((event as CustomEvent).detail.time);
    });
  }
  onStay(time: number) {
    const canvas = this.$refs.canvas as HTMLCanvasElement;
    if (!canvas) return;

    const stayCount = Math.floor( time / this.buttonTimeout)

    if(this.countOfClicks<stayCount){
      (this.$el as HTMLButtonElement).dispatchEvent(new Event('click'))
      this.countOfClicks = stayCount
    }

    const percent = (time - stayCount*this.buttonTimeout)/this.buttonTimeout

    canvas.style.width = "100%";
    canvas.style.height = "100%";
    // ...then set the internal size to match
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const x = width / 2;
    const y = height / 2;

    const radius = Math.min(width, height) * 0.35;
    const lineWidth = 4;
    const startAngle = -Math.PI / 2;
    const endAngle = 2 * Math.PI;

    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = "#ccc";
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.stroke();

    ctx.strokeStyle = "#0F0";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, startAngle + percent * (2 * Math.PI));
    ctx.stroke();
  }
  onExit() {
    this.isInside = false;
  }
  onEnter() {
    this.isInside = true;
    this.countOfClicks = 0;
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
.eyebtn {
  position: relative;
}
canvas {
  position: absolute;
  left: 0;
  top: 0;
}
</style>
