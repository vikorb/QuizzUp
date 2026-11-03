import type { Unsubscribe } from './types'

export type Emitter<T> = {
  emit: (value: T) => void
  on: (listener: (value: T) => void) => Unsubscribe
  clear: () => void
  size: () => number
}

/**
 * Petit émetteur typé. Une erreur dans un abonné n'empêche ni les autres abonnés ni la couche
 * matériel de fonctionner : elle est seulement journalisée.
 */
export function createEmitter<T>(): Emitter<T> {
  const listeners = new Set<(value: T) => void>()

  return {
    emit(value) {
      for (const listener of [...listeners]) {
        try {
          listener(value)
        } catch (error) {
          console.error('[QuizzUp matériel] erreur dans un abonné', error)
        }
      }
    },
    on(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    clear() {
      listeners.clear()
    },
    size() {
      return listeners.size
    },
  }
}
