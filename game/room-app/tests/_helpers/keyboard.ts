/** Appui complet sur une touche physique (enfoncée puis relâchée), comme un vrai buzzer. */
export function pressKey(code: string, target: EventTarget = window): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }))
  target.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }))
}
