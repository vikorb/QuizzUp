<template>
  <div
    class="timer"
    role="progressbar"
    :aria-valuenow="Math.round(clamped * 100)"
    aria-valuemin="0"
    aria-valuemax="100"
    :class="[`timer--${effectiveTone}`, { 'timer--urgent': urgent }]"
  >
    <div class="timer__fill" :style="{ transform: `scaleX(${clamped})` }"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'

import { playUiSound, useRoomGame } from '@/game/useRoomGame'

/** Sous ce seuil la barre passe en `warn` et le son `tick` part à 3, 2 et 1 seconde. */
const URGENT_BELOW_MS = 3000

const props = withDefaults(
  defineProps<{
    /** Part restante (ou écoulée), de 0 à 1. */
    value: number
    tone?: 'default' | 'warn' | 'ok'
    /** Temps restant en ms : active l'état `warn` sous 3 s et le `tick` de chaque seconde. */
    remainingMs?: number
    /** Garde l'état `warn` et la pulsation, mais pas le `tick` (musique en cours). */
    silent?: boolean
  }>(),
  { tone: 'default', silent: false }
)

const clamped = computed(() => Math.min(1, Math.max(0, props.value)))
const urgent = computed(
  () => props.remainingMs !== undefined && props.remainingMs < URGENT_BELOW_MS
)
const effectiveTone = computed(() => (urgent.value ? 'warn' : props.tone))

const { paused } = useRoomGame()

function secondsLeft(ms: number | undefined): number {
  return ms === undefined ? 0 : Math.ceil(ms / 1000)
}

// Un seul `tick` par seconde entamée (3, 2, 1) ; le temps gelé ne change pas de seconde.
let lastSecond = secondsLeft(props.remainingMs)
watch(
  () => props.remainingMs,
  (ms) => {
    const second = secondsLeft(ms)
    if (second === lastSecond) {
      return
    }
    lastSecond = second
    if (second >= 1 && second <= 3 && !props.silent && !paused.value) {
      playUiSound('tick')
    }
  }
)
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

/* Dernières secondes : la barre pulse (opacité seulement). */
.timer--urgent .timer__fill {
  animation: timer-pulse 0.5s ease-in-out infinite alternate;
}

@keyframes timer-pulse {
  from {
    opacity: 1;
  }
  to {
    opacity: 0.55;
  }
}

@media (prefers-reduced-motion: reduce) {
  .timer--urgent .timer__fill {
    animation: none;
  }
}
</style>
