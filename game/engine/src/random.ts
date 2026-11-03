/**
 * Générateur pseudo-aléatoire déterministe (mulberry32).
 *
 * Tout le hasard du moteur passe par ici : à graine identique et commandes
 * identiques, une partie se rejoue à l'identique (tests, historique, débogage).
 * L'état du générateur est un simple entier, stocké dans l'état de la partie.
 */
export type Random = {
  /** Nombre dans [0, 1). */
  next: () => number
  /** État courant, à réinjecter dans `createRandom` pour reprendre la suite. */
  state: () => number
}

export function createRandom(seed: number): Random {
  let current = Math.trunc(seed) | 0

  return {
    next: () => {
      current = (current + 0x6d_2b_79_f5) | 0
      let value = current
      value = Math.imul(value ^ (value >>> 15), value | 1)
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61)

      return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
    },
    state: () => current,
  }
}

export function pickOne<T>(items: readonly T[], random: Random): T | undefined {
  if (items.length === 0) {
    return undefined
  }

  return items[Math.floor(random.next() * items.length)]
}

/** Tire `count` éléments distincts (Fisher-Yates partiel), dans l'ordre du tirage. */
export function drawMany<T>(items: readonly T[], count: number, random: Random): T[] {
  const pool = [...items]
  const drawn: T[] = []
  const total = Math.min(Math.max(count, 0), pool.length)

  for (let index = 0; index < total; index += 1) {
    const pickedIndex = index + Math.floor(random.next() * (pool.length - index))
    const picked = pool[pickedIndex] as T
    pool[pickedIndex] = pool[index] as T
    pool[index] = picked
    drawn.push(picked)
  }

  return drawn
}
