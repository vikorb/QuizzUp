import { onBeforeUnmount, onMounted } from 'vue'

import type { BuzzerPress } from '@/hardware/buzzers'
import { getBuzzerInput } from '@/hardware/roomHardware'

/** Écoute les buzzers de la salle tant que le composant est monté. */
export function useBuzzers(onPress: (press: BuzzerPress) => void): void {
  let off: (() => void) | null = null

  onMounted(() => {
    off = getBuzzerInput().onPress(onPress)
  })

  onBeforeUnmount(() => {
    off?.()
    off = null
  })
}
