import type { Clock } from '../clock'
import { browserClock } from '../clock'
import { createEmitter } from '../emitter'
import { buttonToIndex } from '../types'
import type { BuzzerInput, BuzzerInputState, BuzzerPress, RawKeyPress } from './buzzerInput'
import type { BuzzerKeymap } from './keymap'
import { findSlot, isAllowedBuzzerCode } from './keymap'

type KeyboardLockApi = { lock: (codes?: string[]) => Promise<void>; unlock: () => void }

export type KeyboardBuzzerInputOptions = {
  keymap: BuzzerKeymap
  /** Élément qui reçoit les touches (fenêtre par défaut). */
  target?: Window
  doc?: Document
  clock?: Clock
  /** Empêche l'action par défaut des touches associées (défilement, saisie…). Vrai par défaut. */
  preventDefault?: boolean
}

export type KeyboardBuzzerInput = BuzzerInput & {
  setKeymap: (keymap: BuzzerKeymap) => void
  getKeymap: () => BuzzerKeymap
  /**
   * Capture les touches système (Échap, Alt+Tab…) via l'API Keyboard Lock. Ne fonctionne qu'en
   * plein écran sur Chrome/Edge ; renvoie `false` si le navigateur refuse.
   */
  lockSystemKeys: () => Promise<boolean>
  unlockSystemKeys: () => void
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Partial<HTMLElement>).tagName !== 'string') {
    return false
  }
  const element = target as HTMLElement
  return (
    element.isContentEditable ||
    element.getAttribute?.('contenteditable') === 'true' ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
  )
}

/**
 * Buzzers qui émulent un clavier. Un appui = un buzz jusqu'au relâchement (l'auto-répétition et
 * les appuis maintenus sont ignorés), combinaisons Ctrl/Alt/Méta ignorées, horodatage immédiat.
 */
export function createKeyboardBuzzerInput(
  options: KeyboardBuzzerInputOptions
): KeyboardBuzzerInput {
  const target = options.target ?? window
  const doc = options.doc ?? document
  const clock = options.clock ?? browserClock
  const preventDefault = options.preventDefault ?? true

  const pressEmitter = createEmitter<BuzzerPress>()
  const keyEmitter = createEmitter<RawKeyPress>()
  const changeEmitter = createEmitter<BuzzerInputState>()

  let keymap: BuzzerKeymap = { ...options.keymap }
  const heldCodes = new Set<string>()
  let focused = doc.hasFocus()
  let visible = doc.visibilityState !== 'hidden'
  let keyboardLocked = false
  let disposed = false

  const getState = (): BuzzerInputState => ({
    focused,
    visible,
    active: focused && visible && !disposed,
    keyboardLocked,
    simulation: false,
    held: [...heldCodes].flatMap((code) => {
      const slot = findSlot(keymap, code)
      return slot ? [{ desk: slot.desk, button: slot.button }] : []
    }),
  })

  const notify = () => changeEmitter.emit(getState())

  const onKeyDown = (event: KeyboardEvent) => {
    const at = clock.now()
    const { code } = event
    // Saisie dans un champ (formulaire de la page) ou raccourci (Ctrl+R…) : pas un buzz.
    if (isEditableTarget(event.target) || event.ctrlKey || event.altKey || event.metaKey) {
      return
    }
    const slot = findSlot(keymap, code)

    if (slot && preventDefault) {
      event.preventDefault()
    }
    if (event.repeat || heldCodes.has(code)) {
      return
    }

    heldCodes.add(code)
    const press: BuzzerPress | null = slot
      ? { desk: slot.desk, button: slot.button, buttonIndex: buttonToIndex(slot.button), at, code }
      : null

    if (press) {
      pressEmitter.emit(press)
    }
    if (isAllowedBuzzerCode(code)) {
      keyEmitter.emit({ code, at, press })
    }
    if (press) {
      notify()
    }
  }

  const onKeyUp = (event: KeyboardEvent) => {
    if (heldCodes.delete(event.code) && findSlot(keymap, event.code)) {
      notify()
    }
  }

  const onFullscreenChange = () => {
    // Le navigateur relâche le Keyboard Lock en sortant du plein écran.
    if (!doc.fullscreenElement && keyboardLocked) {
      keyboardLocked = false
      notify()
    }
  }

  const onFocus = () => {
    focused = true
    notify()
  }

  const onBlur = () => {
    // Les relâchements survenus hors focus sont perdus : on repart d'un état propre.
    focused = false
    heldCodes.clear()
    notify()
  }

  const onVisibilityChange = () => {
    visible = doc.visibilityState !== 'hidden'
    if (!visible) {
      heldCodes.clear()
    }
    notify()
  }

  target.addEventListener('keydown', onKeyDown)
  target.addEventListener('keyup', onKeyUp)
  target.addEventListener('focus', onFocus)
  target.addEventListener('blur', onBlur)
  doc.addEventListener('visibilitychange', onVisibilityChange)
  doc.addEventListener('fullscreenchange', onFullscreenChange)

  const keyboardApi = (): KeyboardLockApi | undefined =>
    (target.navigator as (Navigator & { keyboard?: KeyboardLockApi }) | undefined)?.keyboard

  return {
    onPress: pressEmitter.on,
    onKey: keyEmitter.on,
    onChange: changeEmitter.on,
    getState,
    setKeymap(next) {
      keymap = { ...next }
      heldCodes.clear()
      notify()
    },
    getKeymap: () => ({ ...keymap }),
    async lockSystemKeys() {
      const api = keyboardApi()
      if (!api) {
        return false
      }
      try {
        await api.lock()
        keyboardLocked = true
      } catch {
        keyboardLocked = false
      }
      notify()
      return keyboardLocked
    },
    unlockSystemKeys() {
      keyboardApi()?.unlock()
      if (keyboardLocked) {
        keyboardLocked = false
        notify()
      }
    },
    dispose() {
      if (disposed) {
        return
      }
      disposed = true
      target.removeEventListener('keydown', onKeyDown)
      target.removeEventListener('keyup', onKeyUp)
      target.removeEventListener('focus', onFocus)
      target.removeEventListener('blur', onBlur)
      doc.removeEventListener('visibilitychange', onVisibilityChange)
      doc.removeEventListener('fullscreenchange', onFullscreenChange)
      if (keyboardLocked) {
        keyboardApi()?.unlock()
        keyboardLocked = false
      }
      heldCodes.clear()
      notify()
      pressEmitter.clear()
      keyEmitter.clear()
      changeEmitter.clear()
    },
  }
}
