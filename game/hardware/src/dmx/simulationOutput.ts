import { createEmitter } from '../emitter'
import type { Unsubscribe } from '../types'
import type { DmxOutput } from './output'
import { createUniverse } from './universe'

export type SimulationOutput = DmxOutput & {
  /** Dernière trame reçue (copie). */
  lastFrame: () => Uint8Array
  framesSent: () => number
  onFrame: (listener: (universe: Uint8Array) => void) => Unsubscribe
  /** Simule un débranchement de l'interface (tests, démonstration des alertes). */
  simulateDisconnect: (error?: unknown) => void
}

/** Sortie sans matériel : obligatoire pour développer, tester et faire des démonstrations. */
export function createSimulationOutput(): SimulationOutput {
  const frameEmitter = createEmitter<Uint8Array>()
  const disconnectEmitter = createEmitter<unknown>()
  let frame = createUniverse()
  let count = 0

  return {
    driver: 'simulation',
    async open() {},
    async write(universe) {
      frame = universe.slice()
      count += 1
      frameEmitter.emit(frame.slice())
    },
    async close() {},
    onDisconnect: disconnectEmitter.on,
    lastFrame: () => frame.slice(),
    framesSent: () => count,
    onFrame: frameEmitter.on,
    simulateDisconnect(error = new Error('Interface DMX simulée débranchée')) {
      disconnectEmitter.emit(error)
    },
  }
}
