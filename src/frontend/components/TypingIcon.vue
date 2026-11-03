<template>
  <svg
    class="typing-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="paths[name]" />
  </svg>
</template>

<script setup lang="ts">
const paths = {
  sets: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  speak: "M4 9h4l5-4v14l-5-4H4z M16 9a5 5 0 0 1 0 6 M19 6a9 9 0 0 1 0 12",
  stop: "M5 5h14v14H5z",
  pause: "M6 4h4v16H6z M14 4h4v16h-4z",
  resume: "M7 4l13 8-13 8z",
  undo: "M9 4L3 10l6 6 M3 10h11a6 6 0 0 1 0 12",
  clear: "M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7",
  character: "M9 5h12v14H9l-7-7z M13 9l4 6 M17 9l-4 6",
  word: "M8 3h13v18H8l-6-9z M11 8h7 M11 12h7 M11 16h4",
  space: "M3 9v6h18V9",
  cursor: "M3 12h18 M6 9l-3 3 3 3 M18 9l3 3-3 3 M10 3h4 M12 3v18 M10 21h4",
  case: "M5 14V9H2l6-6 6 6h-3v5z M4 20h8 M17 11l4 9 M15 20l4-9 M16 17h4",
  start: "M4 4v16 M20 12H8 M13 7l-5 5 5 5",
  end: "M20 4v16 M4 12h12 M11 7l5 5-5 5",
  left: "M20 12H4 M10 6l-6 6 6 6",
  right: "M4 12h16 M14 6l6 6-6 6",
  wordLeft: "M20 5h-8 M20 9h-5 M20 15H4 M9 10l-5 5 5 5",
  wordRight: "M4 5h8 M4 9h5 M4 15h16 M15 10l5 5-5 5",
  enter: "M20 4v10H4 M9 9l-5 5 5 5"
};
defineProps<{ name: keyof typeof paths }>();
</script>

<style scoped>
.typing-icon {
  width: 1em;
  height: 1em;
  flex: none;
}
</style>
