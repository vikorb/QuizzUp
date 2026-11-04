import { createEmitter } from '../emitter'
import type { Unsubscribe } from '../types'
import type { DmxOutput } from './output'
import { createUniverse } from './universe'

export type SimulationOutput = DmxOutput & {
  /** Dernière trame reçue sur l'univers donné (0 par défaut ; copie). */
  lastFrame: (universe?: number) => Uint8Array
  /** Trames de jeu reçues (comptées sur l'univers 0). */
  framesSent: () => number
  /** Appelé à chaque trame de chaque univers. */
  onFrame: (listener: (data: Uint8Array, universe: number) => void) => Unsubscribe
  /** Simule un débranchement de l'interface (tests, démonstration des alertes). */
  simulateDisconnect: (error?: unknown) => void
}

/** Sortie sans matériel : obligatoire pour développer, tester et faire des démonstrations. */
export function createSimulationOutput(): SimulationOutput {
  const frameEmitter = createEmitter<{ data: Uint8Array; universe: number }>()
  const disconnectEmitter = createEmitter<unknown>()
  const frames = new Map<number, Uint8Array>()
  let count = 0

  return {
    driver: 'simulation',
    async open() {},
    async write(data, universe = 0) {
      frames.set(universe, data.slice())
      if (universe === 0) {
        count += 1
      }
      frameEmitter.emit({ data: data.slice(), universe })
    },
    async close() {},
    onDisconnect: disconnectEmitter.on,
    lastFrame: (universe = 0) => (frames.get(universe) ?? createUniverse()).slice(),
    framesSent: () => count,
    onFrame: (listener) => frameEmitter.on((frame) => listener(frame.data, frame.universe)),
    simulateDisconnect(error = new Error('Interface DMX simulée débranchée')) {
      disconnectEmitter.emit(error)
    },
  }
}
