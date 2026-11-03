import type { ButtonIndex } from '@quizzup/game-engine'

/**
 * Port « buzzers » de l'écran de salle. L'implémentation réelle (apprentissage du
 * mapping touche → pupitre × bouton) vit dans `game/hardware` ; ici on fournit le
 * contrat et un clavier de simulation pour jouer sans matériel.
 */
export type DeskNumber = 1 | 2 | 3 | 4
export type BuzzerButton = 'A' | 'B' | 'C' | 'D'

export type BuzzerPress = {
  desk: DeskNumber
  button: BuzzerButton
  /** Horodatage de l'appui (`performance.now()`), pour départager les buzzs. */
  at: number
}

export type BuzzerInput = {
  /** Abonne un écouteur ; renvoie la fonction de désinscription. */
  onPress: (listener: (press: BuzzerPress) => void) => () => void
  dispose: () => void
}

export const DESKS: readonly DeskNumber[] = [1, 2, 3, 4]
export const BUZZER_BUTTONS: readonly BuzzerButton[] = ['A', 'B', 'C', 'D']

/**
 * Clavier de simulation, par touche physique (`KeyboardEvent.code`, indépendant
 * d'AZERTY / QWERTY) : une rangée par pupitre, de gauche à droite A, B, C, D.
 */
const SIMULATION_ROWS: readonly (readonly string[])[] = [
  ['Digit1', 'Digit2', 'Digit3', 'Digit4'],
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF'],
  ['KeyZ', 'KeyX', 'KeyC', 'KeyV'],
]

export const SIMULATION_KEYMAP: Readonly<
  Record<string, { desk: DeskNumber; button: BuzzerButton }>
> = Object.fromEntries(
  SIMULATION_ROWS.flatMap((codes, row) =>
    codes.map((code, column) => [
      code,
      { desk: DESKS[row] as DeskNumber, button: BUZZER_BUTTONS[column] as BuzzerButton },
    ])
  )
)

/** Touches de simulation d'un pupitre, dans l'ordre A-D (pour l'aide à l'écran). */
export function getSimulationKeys(desk: DeskNumber): string[] {
  return Object.entries(SIMULATION_KEYMAP)
    .filter(([, mapping]) => mapping.desk === desk)
    .map(([code]) => code.replace(/^(Digit|Key)/, ''))
}

export function toEngineButton(button: BuzzerButton): ButtonIndex {
  return BUZZER_BUTTONS.indexOf(button) as ButtonIndex
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  )
}

type KeyboardBuzzerOptions = {
  target?: Pick<Window, 'addEventListener' | 'removeEventListener'>
  keymap?: Readonly<Record<string, { desk: DeskNumber; button: BuzzerButton }>>
  now?: () => number
}

/** Buzzers lus au clavier : auto-répétition et champs de saisie ignorés. */
export function createKeyboardBuzzerInput(options: KeyboardBuzzerOptions = {}): BuzzerInput {
  const target = options.target ?? window
  const keymap = options.keymap ?? SIMULATION_KEYMAP
  const now = options.now ?? (() => performance.now())
  const listeners = new Set<(press: BuzzerPress) => void>()

  function onKeydown(event: KeyboardEvent): void {
    if (event.repeat || isEditableTarget(event.target)) {
      return
    }

    const mapping = keymap[event.code]

    if (!mapping) {
      return
    }

    // L'horodatage est pris avant tout traitement, au plus près de l'appui.
    const at = now()
    event.preventDefault()

    for (const listener of listeners) {
      listener({ ...mapping, at })
    }
  }

  target.addEventListener('keydown', onKeydown as EventListener)

  return {
    onPress(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose() {
      listeners.clear()
      target.removeEventListener('keydown', onKeydown as EventListener)
    },
  }
}
