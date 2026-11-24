const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Piège de focus d'un dialogue modal : Tab et Maj+Tab bouclent à l'intérieur de `container`.
 * Un focus tombé hors du dialogue (clic sur une zone inerte) y est ramené.
 */
export function trapTabKey(event: KeyboardEvent, container: HTMLElement | null): void {
  if (event.key !== 'Tab' || !container) {
    return
  }

  const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute('disabled')
  )
  const first = focusables[0]
  const last = focusables[focusables.length - 1]

  if (!first || !last) {
    return
  }

  const active = document.activeElement as HTMLElement | null

  if (!active || !container.contains(active)) {
    event.preventDefault()
    first.focus()
    return
  }

  if (event.shiftKey && active === first) {
    event.preventDefault()
    last.focus()
    return
  }

  if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}
