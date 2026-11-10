import { GAZE_TTL_MS, type BubbleFrame, type BubblePreferences } from "./contract";

export class GazePresentation {
  private sequence = -Infinity;
  private geometry = "";
  private point: { x: number; y: number; time: number; expires: number } | null = null;

  reset(): void {
    this.sequence = -Infinity;
    this.geometry = "";
    this.point = null;
  }

  record(
    sample: { x: number; y: number; sequence: number; ageMs: number },
    bounds: { left: number; top: number; width: number; height: number },
    size: { width: number; height: number },
    smoothness: number,
    now: number
  ): void {
    const newer = Number.isFinite(sample.sequence) && sample.sequence > this.sequence;
    if (newer) this.sequence = sample.sequence;
    const geometry = [
      bounds.left,
      bounds.top,
      bounds.width,
      bounds.height,
      size.width,
      size.height
    ].join(",");
    if (geometry !== this.geometry) this.point = null;
    this.geometry = geometry;
    if (
      ![
        ...Object.values(sample),
        ...Object.values(bounds),
        ...Object.values(size),
        smoothness,
        now
      ].every(Number.isFinite) ||
      bounds.width <= 0 ||
      bounds.height <= 0 ||
      size.width <= 0 ||
      size.height <= 0 ||
      sample.ageMs < 0 ||
      sample.ageMs >= GAZE_TTL_MS ||
      sample.x < bounds.left ||
      sample.x >= bounds.left + bounds.width ||
      sample.y < bounds.top ||
      sample.y >= bounds.top + bounds.height
    ) {
      this.point = null;
      return;
    }
    if (!newer) return;
    const x = ((sample.x - bounds.left) / bounds.width) * size.width;
    const y = ((sample.y - bounds.top) / bounds.height) * size.height;
    const time = now - sample.ageMs;
    const previous = this.point && this.point.expires > now ? this.point : null;
    const tau = 0.005 + (0.2 * Math.max(0, Math.min(100, smoothness))) / 100;
    const alpha = previous ? 1 - Math.exp(-Math.max(0, time - previous.time) / 1000 / tau) : 1;
    this.point = {
      x: previous ? previous.x + alpha * (x - previous.x) : x,
      y: previous ? previous.y + alpha * (y - previous.y) : y,
      time,
      expires: time + GAZE_TTL_MS
    };
  }

  frame(preferences: BubblePreferences, now: number): BubbleFrame {
    if (!Number.isFinite(now) || (this.point && this.point.expires <= now)) this.point = null;
    if (!preferences.enabled || !this.point) return null;
    return {
      x: this.point.x,
      y: this.point.y,
      remainingMs: Math.min(GAZE_TTL_MS, this.point.expires - now),
      diameter: preferences.diameter,
      brightness: preferences.brightness
    };
  }
}
