import { onScopeDispose, type Ref, ref, watch } from 'vue'

import { prefersReducedMotion } from '@/utils/reducedMotion'

const DEFAULT_DURATION_MS = 400

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3
}

/**
 * Nombre affiché qui monte (ou descend) vers `target` en `durationMs`, par `requestAnimationFrame`.
 * Sans `from`, il démarre déjà à la valeur cible ; avec `from`, il y monte dès le montage.
 * Mouvement réduit : saut direct à la valeur finale. La boucle s'arrête en fin de course et au
 * démontage (le composant de la salle tourne des heures : rien ne doit survivre).
 */
export function useTweenedNumber(
  target: () => number,
  options: { from?: number; durationMs?: number } = {}
): Readonly<Ref<number>> {
  const { from, durationMs = DEFAULT_DURATION_MS } = options
  const shown = ref(from ?? target())
  let frame = 0

  function cancel(): void {
    if (frame !== 0) {
      cancelAnimationFrame(frame)
      frame = 0
    }
  }

  function animateTo(end: number): void {
    cancel()
    const start = shown.value
    if (start === end || prefersReducedMotion()) {
      shown.value = end
      return
    }
    let startedAt: number | null = null
    const step = (time: number): void => {
      startedAt ??= time
      const progress = Math.min(1, (time - startedAt) / durationMs)
      shown.value = progress >= 1 ? end : Math.round(start + (end - start) * easeOutCubic(progress))
      frame = progress >= 1 ? 0 : requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
  }

  watch(target, animateTo)
  if (from !== undefined) {
    animateTo(target())
  }
  onScopeDispose(cancel)

  return shown
}
