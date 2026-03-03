<script setup lang="ts">
import { onMounted, ref } from "vue"

const api = import.meta.env.VITE_API_URL as string
const health = ref("...")

onMounted(async () => {
  try {
    const r = await fetch(`${api}/health`)
    const j = await r.json()
    health.value = j.status
  } catch {
    health.value = "API unreachable"
  }
})
</script>

<template>
  <main style="padding: 24px; font-family: system-ui;">
    <h1>Quizzup Backoffice</h1>
    <p>API health: <b>{{ health }}</b></p>
  </main>
</template>
