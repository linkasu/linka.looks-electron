import type { BubbleFrame } from "../../common/bubble/contract";

declare global {
  interface Window {
    bubbleOverlay: { nextFrame(): Promise<BubbleFrame> };
  }
}

const bubble = document.getElementById("bubble")!;
const circles = ["fill", "white", "dark", "center"].map((id) => document.getElementById(id)!);
let expires = 0;
let pending = false;
let lastRequest = -Infinity;

function hide() {
  bubble.style.visibility = "hidden";
}

async function requestFrame() {
  pending = true;
  const started = performance.now();
  lastRequest = started;
  try {
    const frame = await window.bubbleOverlay.nextFrame();
    const now = performance.now();
    // Subtract the whole round trip: a queued reply must never renew an old sample.
    const remaining = frame ? Math.min(300, frame.remainingMs) - (now - started) : 0;
    if (!frame || remaining <= 0 || !Object.values(frame).every(Number.isFinite)) {
      expires = 0;
      hide();
      return;
    }
    expires = now + remaining;
    const diameter = frame.diameter;
    const center = diameter / 2;
    bubble.style.width = `${diameter}px`;
    bubble.style.height = `${diameter}px`;
    bubble.style.transform = `translate(${frame.x - center}px, ${frame.y - center}px)`;
    bubble.style.opacity = String(frame.brightness / 100);
    circles.forEach((circle, index) => {
      circle.setAttribute("cx", String(center));
      circle.setAttribute("cy", String(center));
      if (index < 3) circle.setAttribute("r", String(Math.max(0, center - [3, 3, 4.5][index])));
    });
    bubble.style.visibility = "visible";
  } catch {
    expires = 0;
    hide();
  } finally {
    pending = false;
  }
}

function tick(now: number) {
  if (now >= expires) hide();
  if (!pending && now - lastRequest >= 1000 / 60) void requestFrame();
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
