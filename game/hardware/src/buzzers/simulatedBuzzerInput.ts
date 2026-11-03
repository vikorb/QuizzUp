import type { Clock } from '../clock'
import { browserClock } from '../clock'
import { createEmitter } from '../emitter'
import type { BuzzerButton, Desk } from '../types'
import { buttonToIndex } from '../types'
import type { BuzzerInput, BuzzerInputState, BuzzerPress, RawKeyPress } from './buzzerInput'

export type SimulatedBuzzerInput = BuzzerInput & {
  /** Simule un appui (boutons à l'écran, tests, démo commerciale). */
  press: (desk: Desk, button: BuzzerButton, at?: number) => BuzzerPress | null
}

/** Source de buzzers sans matériel : toujours active, alimentée par `press()`. */
export function createSimulatedBuzzerInput(options: { clock?: Clock } = {}): SimulatedBuzzerInput {
  const clock = options.clock ?? browserClock
  const pressEmitter = createEmitter<BuzzerPress>()
  const keyEmitter = createEmitter<RawKeyPress>()
  const changeEmitter = createEmitter<BuzzerInputState>()
  let disposed = false

  const getState = (): BuzzerInputState => ({
    focused: true,
    visible: true,
    active: !disposed,
    keyboardLocked: false,
    simulation: true,
    held: [],
  })

  return {
    press(desk, button, at = clock.now()) {
      if (disposed) {
        return null
      }
      const press: BuzzerPress = {
        desk,
        button,
        buttonIndex: buttonToIndex(button),
        at,
        code: 'simulation',
      }
      pressEmitter.emit(press)
      keyEmitter.emit({ code: 'simulation', at, press })
      return press
    },
    onPress: pressEmitter.on,
    onKey: keyEmitter.on,
    onChange: changeEmitter.on,
    getState,
    dispose() {
      if (disposed) {
        return
      }
      disposed = true
      changeEmitter.emit(getState())
      pressEmitter.clear()
      keyEmitter.clear()
      changeEmitter.clear()
    },
  }
}
