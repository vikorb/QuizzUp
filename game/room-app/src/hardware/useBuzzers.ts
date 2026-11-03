import { onBeforeUnmount, onMounted } from 'vue'

import { type BuzzerInput, type BuzzerPress, createKeyboardBuzzerInput } from '@/hardware/buzzers'

/**
 * Fabrique des buzzers utilisée par les écrans. Par défaut : clavier de
 * simulation. Le mapping appris (`game/hardware`) se branchera ici.
 */
let factory: () => BuzzerInput = () => createKeyboardBuzzerInput()

export function setBuzzerInputFactory(next: () => BuzzerInput): void {
  factory = next
}

/** Écoute les buzzers tant que le composant est monté. */
export function useBuzzers(onPress: (press: BuzzerPress) => void): void {
  let input: BuzzerInput | null = null

  onMounted(() => {
    input = factory()
    input.onPress(onPress)
  })

  onBeforeUnmount(() => {
    input?.dispose()
    input = null
  })
}
