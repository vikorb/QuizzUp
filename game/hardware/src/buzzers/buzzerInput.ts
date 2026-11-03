import type { ButtonIndex, BuzzerButton, Desk, Unsubscribe } from '../types'

/** Un appui de buzzer, horodaté au moment de la capture (ms monotones, base `performance.now()`). */
export type BuzzerPress = {
  desk: Desk
  button: BuzzerButton
  /** Même buzzer au format du moteur de jeu : 0 = A … 3 = D. */
  buttonIndex: ButtonIndex
  at: number
  /** Touche physique d'origine (`KeyboardEvent.code`), ou `simulation`. */
  code: string
}

/** Toute touche enfoncée (première pression seulement), associée ou non : apprentissage, test. */
export type RawKeyPress = { code: string; at: number; press: BuzzerPress | null }

export type BuzzerInputState = {
  /** La page a le focus clavier : sans lui, les buzzers ne sont pas reçus. */
  focused: boolean
  /** L'onglet est visible. */
  visible: boolean
  /** Les buzzers fonctionnent (focus + onglet visible + entrée non arrêtée). */
  active: boolean
  /** Touches système capturées par l'API Keyboard Lock (Chrome/Edge en plein écran). */
  keyboardLocked: boolean
  simulation: boolean
  /** Buzzers actuellement maintenus enfoncés. */
  held: { desk: Desk; button: BuzzerButton }[]
}

/**
 * Source d'entrée des buzzers. V1 : clavier (encodeurs arcade USB). Plus tard, une source série
 * (ESP32) ou tablettes implémentera la même interface sans toucher au moteur ni aux écrans.
 */
export type BuzzerInput = {
  onPress: (listener: (press: BuzzerPress) => void) => Unsubscribe
  onKey: (listener: (key: RawKeyPress) => void) => Unsubscribe
  getState: () => BuzzerInputState
  onChange: (listener: (state: BuzzerInputState) => void) => Unsubscribe
  dispose: () => void
}
