import type { Clock, TimerHandle } from '../clock'
import { browserClock } from '../clock'
import { createEmitter } from '../emitter'
import { buttonToIndex } from '../types'
import type { BuzzerInput, BuzzerInputState, BuzzerPress, RawKeyPress } from './buzzerInput'
import type { BuzzerKeymap } from './keymap'
import { findSlot } from './keymap'

/** Préfixe des codes de buzzers manette : `GamepadButton0`, `GamepadButton1`… */
export const GAMEPAD_CODE_PREFIX = 'GamepadButton'

/** Code d'un bouton de manette dans le mapping (`buzzers.keymap`), à côté des touches clavier. */
export function gamepadButtonCode(buttonIndex: number): string {
  return `${GAMEPAD_CODE_PREFIX}${buttonIndex}`
}

/** Sous-ensemble de l'objet `Gamepad` du navigateur utilisé ici (remplaçable en test). */
export type GamepadLike = {
  index: number
  id: string
  connected: boolean
  /** Dernière mise à jour des données, même base que `performance.now()`. */
  timestamp: number
  buttons: readonly { pressed: boolean }[]
}

export type GamepadSource = { getGamepads: () => readonly (GamepadLike | null)[] }

export type GamepadBuzzerInputOptions = {
  keymap: BuzzerKeymap
  /** `navigator` par défaut. */
  source?: GamepadSource
  target?: Window
  doc?: Document
  clock?: Clock
  /** Période de lecture des boutons, en ms (4 par défaut, le minimum des minuteurs du navigateur). */
  pollMs?: number
  /** Choix de la carte quand plusieurs manettes sont branchées (par défaut : la première). */
  match?: (id: string) => boolean
}

export type GamepadInfo = { id: string; buttons: number }

export type GamepadBuzzerInput = BuzzerInput & {
  setKeymap: (keymap: BuzzerKeymap) => void
  getKeymap: () => BuzzerKeymap
  /** Carte lue actuellement, `null` si aucune n'est visible par le navigateur. */
  getGamepad: () => GamepadInfo | null
}

/**
 * Buzzers câblés sur une carte d'entrées USB vue comme une **manette** (« joystick » HID, par
 * exemple une carte 32 boutons pour simulateurs), lue avec l'API Gamepad de Chrome / Edge.
 * Aucun logiciel de conversion manette → clavier n'est nécessaire et les appuis ne dépendent pas
 * du focus clavier. Le navigateur n'expose la carte qu'après un premier appui sur un bouton.
 *
 * L'API Gamepad se lit par sondage : un appui est horodaté avec la mise à jour de la carte
 * (`Gamepad.timestamp`), bornée entre deux lectures, pour départager les buzzs au plus juste.
 */
export function createGamepadBuzzerInput(options: GamepadBuzzerInputOptions): GamepadBuzzerInput {
  const target = options.target ?? window
  const doc = options.doc ?? document
  const clock = options.clock ?? browserClock
  const browserSource = target.navigator as Partial<GamepadSource> | undefined
  const source: GamepadSource | undefined =
    options.source ??
    (typeof browserSource?.getGamepads === 'function'
      ? (browserSource as GamepadSource)
      : undefined)
  const pollMs = Math.max(1, options.pollMs ?? 4)

  const pressEmitter = createEmitter<BuzzerPress>()
  const keyEmitter = createEmitter<RawKeyPress>()
  const changeEmitter = createEmitter<BuzzerInputState>()

  let keymap: BuzzerKeymap = { ...options.keymap }
  const heldCodes = new Set<string>()
  let gamepad: GamepadInfo | null = null
  let visible = doc.visibilityState !== 'hidden'
  let focused = doc.hasFocus()
  let disposed = false
  // Après une reprise (onglet masqué, carte rebranchée), les boutons déjà enfoncés ne comptent pas.
  let resync = true
  let lastPollAt = clock.now()
  let timer: TimerHandle | null = null

  const getState = (): BuzzerInputState => ({
    focused,
    visible,
    active: visible && gamepad !== null && !disposed,
    keyboardLocked: false,
    simulation: false,
    held: [...heldCodes].flatMap((code) => {
      const slot = findSlot(keymap, code)
      return slot ? [{ desk: slot.desk, button: slot.button }] : []
    }),
  })

  const notify = () => changeEmitter.emit(getState())

  const readGamepad = (): GamepadLike | null => {
    let pads: readonly (GamepadLike | null)[]
    try {
      pads = source?.getGamepads() ?? []
    } catch {
      // Politique de permissions « gamepad » refusée : comme si aucune carte n'était branchée.
      pads = []
    }
    return (
      pads.find((pad): pad is GamepadLike =>
        Boolean(pad?.connected && (options.match ? options.match(pad.id) : true))
      ) ?? null
    )
  }

  const poll = () => {
    const now = clock.now()
    const pad = readGamepad()
    const info = pad ? { id: pad.id, buttons: pad.buttons.length } : null
    const changed = info?.id !== gamepad?.id || info?.buttons !== gamepad?.buttons
    gamepad = info

    if (!pad || !visible) {
      const hadHeld = heldCodes.size > 0
      heldCodes.clear()
      resync = true
      lastPollAt = now
      if (changed || hadHeld) {
        notify()
      }
      return
    }

    const pressed = new Set<string>()
    pad.buttons.forEach((button, index) => {
      if (button.pressed) {
        pressed.add(gamepadButtonCode(index))
      }
    })

    let heldChanged = false
    if (resync) {
      resync = false
      heldCodes.clear()
      for (const code of pressed) {
        heldCodes.add(code)
      }
      heldChanged = true
    } else {
      const at =
        Number.isFinite(pad.timestamp) && pad.timestamp > 0
          ? Math.min(now, Math.max(lastPollAt, pad.timestamp))
          : now
      for (const code of heldCodes) {
        if (!pressed.has(code)) {
          heldCodes.delete(code)
          heldChanged = heldChanged || findSlot(keymap, code) !== null
        }
      }
      for (const code of pressed) {
        if (heldCodes.has(code)) {
          continue
        }
        heldCodes.add(code)
        const slot = findSlot(keymap, code)
        const press: BuzzerPress | null = slot
          ? {
              desk: slot.desk,
              button: slot.button,
              buttonIndex: buttonToIndex(slot.button),
              at,
              code,
            }
          : null
        if (press) {
          pressEmitter.emit(press)
          heldChanged = true
        }
        keyEmitter.emit({ code, at, press })
      }
    }
    lastPollAt = now
    if (changed || heldChanged) {
      notify()
    }
  }

  const onVisibilityChange = () => {
    visible = doc.visibilityState !== 'hidden'
    if (!visible) {
      heldCodes.clear()
      resync = true
    }
    notify()
  }
  const onFocus = () => {
    focused = true
    notify()
  }
  const onBlur = () => {
    focused = false
    notify()
  }

  doc.addEventListener('visibilitychange', onVisibilityChange)
  target.addEventListener('focus', onFocus)
  target.addEventListener('blur', onBlur)
  target.addEventListener('gamepadconnected', poll)
  target.addEventListener('gamepaddisconnected', poll)
  timer = clock.setInterval(poll, pollMs)
  poll()

  return {
    onPress: pressEmitter.on,
    onKey: keyEmitter.on,
    onChange: changeEmitter.on,
    getState,
    setKeymap(next) {
      keymap = { ...next }
      notify()
    },
    getKeymap: () => ({ ...keymap }),
    getGamepad: () => (gamepad ? { ...gamepad } : null),
    dispose() {
      if (disposed) {
        return
      }
      disposed = true
      if (timer !== null) {
        clock.clearInterval(timer)
        timer = null
      }
      doc.removeEventListener('visibilitychange', onVisibilityChange)
      target.removeEventListener('focus', onFocus)
      target.removeEventListener('blur', onBlur)
      target.removeEventListener('gamepadconnected', poll)
      target.removeEventListener('gamepaddisconnected', poll)
      heldCodes.clear()
      notify()
      pressEmitter.clear()
      keyEmitter.clear()
      changeEmitter.clear()
    },
  }
}
