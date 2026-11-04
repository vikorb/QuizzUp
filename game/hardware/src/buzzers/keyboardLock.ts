/** API Keyboard Lock du navigateur (Chrome / Edge), absente ailleurs. */
type KeyboardLockApi = { lock: (codes?: string[]) => Promise<void>; unlock: () => void }

export type KeyboardLockOptions = {
  target: Window
  doc: Document
  /** Appelé quand l'état du verrou change (verrouillé, relâché, sortie du plein écran). */
  onChange: () => void
}

/** Verrou des touches système, indépendant de la source des buzzers (clavier ou manette). */
export type KeyboardLock = {
  /** Capte Échap, Alt+Tab… Ne fonctionne qu'en plein écran ; `false` si le navigateur refuse. */
  lock: () => Promise<boolean>
  unlock: () => void
  isLocked: () => boolean
  /** Relâche le verrou et retire l'écoute du plein écran. */
  dispose: () => void
}

/**
 * Le verrou sert à ce qu'Échap et les raccourcis système ne fassent pas quitter le plein écran
 * pendant une partie. Il ne dépend pas de la façon dont les buzzers sont lus : les touches
 * restent livrées à la page (raccourcis du staff au clavier), elles ne sont plus traitées par
 * le navigateur.
 */
export function createKeyboardLock(options: KeyboardLockOptions): KeyboardLock {
  const { target, doc, onChange } = options
  let locked = false

  const api = (): KeyboardLockApi | undefined =>
    (target.navigator as (Navigator & { keyboard?: KeyboardLockApi }) | undefined)?.keyboard

  const onFullscreenChange = () => {
    // Le navigateur relâche le Keyboard Lock en sortant du plein écran.
    if (!doc.fullscreenElement && locked) {
      locked = false
      onChange()
    }
  }

  doc.addEventListener('fullscreenchange', onFullscreenChange)

  return {
    async lock() {
      const keyboard = api()
      if (!keyboard) {
        return false
      }
      try {
        await keyboard.lock()
        locked = true
      } catch {
        locked = false
      }
      onChange()
      return locked
    },
    unlock() {
      api()?.unlock()
      if (locked) {
        locked = false
        onChange()
      }
    },
    isLocked: () => locked,
    dispose() {
      doc.removeEventListener('fullscreenchange', onFullscreenChange)
      if (locked) {
        api()?.unlock()
        locked = false
      }
    },
  }
}
