<template>
  <div
    class="timer"
    role="progressbar"
    :aria-valuenow="Math.round(clamped * 100)"
    aria-valuemin="0"
    aria-valuemax="100"
    :class="`timer--${tone}`"
  >
    <div class="timer__fill" :style="{ transform: `scaleX(${clamped})` }"></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Part restante (ou écoulée), de 0 à 1. */
    value: number
    tone?: 'default' | 'warn' | 'ok'
  }>(),
  { tone: 'default' }
)

const clamped = computed(() => Math.min(1, Math.max(0, props.value)))
</script>

<style scoped>
.timer {
  height: 10px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}

.timer__fill {
  height: 100%;
  transform-origin: left center;
  background: linear-gradient(90deg, var(--accent-blue), var(--accent-purple), var(--accent-pink));
  box-shadow: 0 0 18px var(--glow-pink);
  transition: transform 0.1s linear;
}

.timer--warn .timer__fill {
  background: var(--warn);
  box-shadow: 0 0 18px var(--warn-bg);
}

.timer--ok .timer__fill {
  background: var(--ok);
  box-shadow: 0 0 18px var(--glow-cyan);
}
</style>
