import { createEmitter } from '../emitter'
import type { Desk, Unsubscribe } from '../types'
import { DESKS } from '../types'
import type { BuzzerKeymap, BuzzerSlot } from './keymap'
import { findSlot, isAllowedBuzzerCode, listSlots } from './keymap'

export type LearningCaptureResult =
  | { status: 'assigned'; slot: BuzzerSlot; code: string }
  | { status: 'duplicate'; code: string; usedBy: BuzzerSlot }
  | { status: 'forbidden'; code: string }
  | { status: 'ignored' }

export type BuzzerLearningState = {
  /** Buzzer sur lequel on attend un appui ; `null` quand l'apprentissage est terminé. */
  current: BuzzerSlot | null
  stepIndex: number
  totalSteps: number
  done: boolean
  keymap: BuzzerKeymap
  lastResult: LearningCaptureResult | null
}

export type BuzzerLearning = {
  capture: (code: string) => LearningCaptureResult
  skip: () => void
  back: () => void
  restart: () => void
  getState: () => BuzzerLearningState
  onChange: (listener: (state: BuzzerLearningState) => void) => Unsubscribe
  getKeymap: () => BuzzerKeymap
}

export type BuzzerLearningOptions = {
  /** Pupitres à associer (4 par défaut ; une petite salle peut n'en avoir que 2). */
  desks?: readonly Desk[]
}

/**
 * Mode apprentissage : « appuyez sur le buzzer A du pupitre 1 », puis B, C, D, pupitre 2…
 * Machine d'état pure, alimentée par les codes de touches (voir `BuzzerInput.onKey`).
 */
export function createBuzzerLearning(options: BuzzerLearningOptions = {}): BuzzerLearning {
  const slots = listSlots(options.desks ?? DESKS)
  const emitter = createEmitter<BuzzerLearningState>()
  let stepIndex = 0
  let keymap: BuzzerKeymap = {}
  let lastResult: LearningCaptureResult | null = null

  const getState = (): BuzzerLearningState => ({
    current: slots[stepIndex] ?? null,
    stepIndex,
    totalSteps: slots.length,
    done: stepIndex >= slots.length,
    keymap: { ...keymap },
    lastResult,
  })

  const notify = () => emitter.emit(getState())

  const removeSlot = (slot: BuzzerSlot) => {
    keymap = Object.fromEntries(
      Object.entries(keymap).filter(
        ([, assigned]) => assigned.desk !== slot.desk || assigned.button !== slot.button
      )
    )
  }

  return {
    capture(code) {
      const current = slots[stepIndex]
      if (!current) {
        lastResult = { status: 'ignored' }
        return lastResult
      }
      if (!isAllowedBuzzerCode(code)) {
        lastResult = { status: 'forbidden', code }
      } else {
        const usedBy = findSlot(keymap, code)
        if (usedBy) {
          lastResult = { status: 'duplicate', code, usedBy }
        } else {
          removeSlot(current)
          keymap = { ...keymap, [code]: current }
          stepIndex += 1
          lastResult = { status: 'assigned', slot: current, code }
        }
      }
      notify()
      return lastResult
    },
    skip() {
      if (stepIndex < slots.length) {
        stepIndex += 1
        lastResult = null
        notify()
      }
    },
    back() {
      if (stepIndex > 0) {
        stepIndex -= 1
        const previous = slots[stepIndex]
        if (previous) {
          removeSlot(previous)
        }
        lastResult = null
        notify()
      }
    },
    restart() {
      stepIndex = 0
      keymap = {}
      lastResult = null
      notify()
    },
    getState,
    onChange: emitter.on,
    getKeymap: () => ({ ...keymap }),
  }
}
