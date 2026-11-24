/**
 * L'opérateur a-t-il demandé moins de mouvement ? La règle CSS ne couvre ni `requestAnimationFrame`
 * ni le Canvas : ces animations vérifient elles-mêmes (sans `matchMedia`, mouvement permis).
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
