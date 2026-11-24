import { readonly, type Ref, ref } from 'vue'

/**
 * L'opérateur a-t-il demandé moins de mouvement ? La règle CSS ne couvre ni `requestAnimationFrame`
 * ni le Canvas ni les transitions de Vue : ces animations vérifient elles-mêmes (sans `matchMedia`,
 * mouvement permis).
 *
 * Un seul `MediaQueryList` pour toute la page, écouté en continu : la valeur suit un changement de
 * réglage système en cours de partie et aucune lecture ne crée d'objet. Il est recréé seulement si
 * `window.matchMedia` change (tests).
 */
const QUERY = '(prefers-reduced-motion: reduce)'
const reduced = ref(false)
let source: unknown = null
let list: MediaQueryList | null = null

function onChange(event: MediaQueryListEvent): void {
  reduced.value = event.matches
}

function sync(): void {
  const matchMedia = typeof window === 'undefined' ? undefined : window.matchMedia
  if (matchMedia === source) {
    return
  }
  source = matchMedia
  list?.removeEventListener?.('change', onChange)
  list = typeof matchMedia === 'function' ? matchMedia.call(window, QUERY) : null
  reduced.value = list?.matches ?? false
  list?.addEventListener?.('change', onChange)
}

export function prefersReducedMotion(): boolean {
  sync()
  return reduced.value
}

/** Même préférence, réactive : pour un gabarit qui doit se rendre à nouveau quand elle change. */
export function useReducedMotion(): Readonly<Ref<boolean>> {
  sync()
  return readonly(reduced)
}
