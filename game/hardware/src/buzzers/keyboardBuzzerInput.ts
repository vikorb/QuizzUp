import type { Clock } from '../clock'
import { browserClock } from '../clock'
import { createEmitter } from '../emitter'
import { buttonToIndex } from '../types'
import type { BuzzerInput, BuzzerInputState, BuzzerPress, RawKeyPress } from './buzzerInput'
import { createKeyboardLock } from './keyboardLock'
import type { BuzzerKeymap } from './keymap'
import { findSlot, isAllowedBuzzerCode } from './keymap'

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

/**
 * Instant de l'appui : `event.timeStamp` (posé par le navigateur à la réception de la touche, même
 * base que `performance.now()`), donc insensible au retard du thread principal. Repli sur
 * `now` si la valeur est absente, nulle, non finie ou dans le futur (base d'horloge différente).
 */
// ponytail: le moteur (`reduceGame`) ramène tout appui en retard sur le dernier instant connu
// (`max(at, lastAt)`). Si un tick ou un appui manette passe avant ce handler, l'appui clavier
// antérieur perd son avance (palier ou ordre faussés). Piste : trier les appuis d'une même tâche
// par `at` avant de les envoyer au moteur.
export function eventTime(timeStamp: number | undefined, now: number): number {
  return typeof timeStamp === 'number' &&
    Number.isFinite(timeStamp) &&
    timeStamp > 0 &&
    timeStamp <= now
    ? timeStamp
    : now
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
  let disposed = false

  // Le rappel passe par `notify`, déclaré juste après (appelé plus tard seulement).
  const systemKeys = createKeyboardLock({ target, doc, onChange: () => notify() })

  const getState = (): BuzzerInputState => ({
    focused,
    visible,
    active: focused && visible && !disposed,
    keyboardLocked: systemKeys.isLocked(),
    simulation: false,
    held: [...heldCodes].flatMap((code) => {
      const slot = findSlot(keymap, code)
      return slot ? [{ desk: slot.desk, button: slot.button }] : []
    }),
  })

  const notify = () => changeEmitter.emit(getState())

  const onKeyDown = (event: KeyboardEvent) => {
    const at = eventTime(event.timeStamp, clock.now())
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
    lockSystemKeys: systemKeys.lock,
    unlockSystemKeys: systemKeys.unlock,
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
      systemKeys.dispose()
      heldCodes.clear()
      notify()
      pressEmitter.clear()
      keyEmitter.clear()
      changeEmitter.clear()
    },
  }
}
