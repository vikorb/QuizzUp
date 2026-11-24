<template>
  <Teleport to="body">
    <canvas v-if="active" ref="canvas" class="confetti" aria-hidden="true" data-test="confetti" />
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { prefersReducedMotion } from '@/utils/reducedMotion'

const PARTICLES_COUNT = 150
const DURATION_MS = 4000
/** Les confettis s'effacent sur cette fin de course. */
const FADE_MS = 800
const GRAVITY_PX_S2 = 900
const DESK_COLOR_VARS = ['--desk-1', '--desk-2', '--desk-3', '--desk-4', '--desk-5', '--desk-6']

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  angle: number
  spin: number
  color: string
}

// Mouvement réduit : le Canvas n'est même pas monté.
const active = ref(!prefersReducedMotion())
const canvas = ref<HTMLCanvasElement | null>(null)
let frame = 0

function cancel(): void {
  if (frame !== 0) {
    cancelAnimationFrame(frame)
    frame = 0
  }
}

/** Fin de l'animation : boucle arrêtée, canvas retiré du document. */
function stop(): void {
  cancel()
  active.value = false
}

function between(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

onMounted(() => {
  const element = canvas.value
  const context = element?.getContext('2d') ?? null
  if (!element || !context) {
    active.value = false
    return
  }

  const { innerWidth: width, innerHeight: height } = window
  element.width = width
  element.height = height

  // Le Canvas ne lit pas `var(--…)` : on lit les couleurs des pupitres une fois.
  const styles = getComputedStyle(document.documentElement)
  const fromTokens = DESK_COLOR_VARS.map((name) => styles.getPropertyValue(name).trim()).filter(
    Boolean
  )
  const palette = fromTokens.length > 0 ? fromTokens : [getComputedStyle(element).color]

  const particles: Particle[] = Array.from({ length: PARTICLES_COUNT }, (_item, index) => ({
    x: between(0, width),
    y: between(-height * 0.4, 0),
    vx: between(-120, 120),
    vy: between(80, 380),
    size: between(8, 16),
    angle: between(0, Math.PI * 2),
    spin: between(-8, 8),
    color: palette[index % palette.length] ?? '',
  }))

  let startedAt: number | null = null
  let lastTime = 0
  const step = (time: number): void => {
    startedAt ??= time
    const elapsed = time - startedAt
    if (elapsed >= DURATION_MS) {
      stop()
      return
    }
    const seconds = lastTime === 0 ? 0 : (time - lastTime) / 1000
    lastTime = time

    context.clearRect(0, 0, width, height)
    context.globalAlpha = Math.min(1, (DURATION_MS - elapsed) / FADE_MS)
    for (const particle of particles) {
      particle.vy += GRAVITY_PX_S2 * seconds
      particle.x += particle.vx * seconds
      particle.y += particle.vy * seconds
      particle.angle += particle.spin * seconds
      context.save()
      context.translate(particle.x, particle.y)
      context.rotate(particle.angle)
      context.fillStyle = particle.color
      context.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2)
      context.restore()
    }
    frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
})

onBeforeUnmount(cancel)
</script>

<style scoped>
.confetti {
  position: fixed;
  inset: 0;
  z-index: 5;
  width: 100%;
  height: 100%;
  pointer-events: none;
  color: var(--text-0);
}
</style>
