<template>
  <section>
    <p role="status">{{ error || "Открываю клавиатуру…" }}</p>
    <button v-if="error" type="button" @click="router.push('/§')">К наборам</button>
  </section>
</template>
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ipcRenderer } from "electron";
const router = useRouter();
const error = ref("");
onMounted(async () => {
  try {
    await ipcRenderer.invoke("typing:open");
    await router.replace("/§");
  } catch {
    error.value = "Не удалось открыть изолированную клавиатуру.";
  }
});
</script>
