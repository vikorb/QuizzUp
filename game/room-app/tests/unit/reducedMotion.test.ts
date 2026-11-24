import { prefersReducedMotion, useReducedMotion } from '@/utils/reducedMotion'

type ChangeListener = (event: MediaQueryListEvent) => void

/** `matchMedia` simulé, avec écoute de `change` : renvoie la fonction et de quoi déclencher l'événement. */
function stubMatchMedia(matches: boolean) {
  const listeners = new Set<ChangeListener>()
  const list = {
    matches,
    addEventListener: vi.fn((_type: string, listener: ChangeListener) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: ChangeListener) =>
      listeners.delete(listener)
    ),
  }
  const matchMedia = vi.fn(() => list)
  vi.stubGlobal('matchMedia', matchMedia)
  return {
    matchMedia,
    list,
    change(next: boolean) {
      for (const listener of listeners) {
        listener({ matches: next } as MediaQueryListEvent)
      }
    },
  }
}

describe('prefersReducedMotion', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('ne crée qu’un seul MediaQueryList, même lu à chaque rendu', () => {
    const { matchMedia, list } = stubMatchMedia(true)

    for (let index = 0; index < 50; index++) {
      expect(prefersReducedMotion()).toBe(true)
    }

    expect(matchMedia).toHaveBeenCalledTimes(1)
    expect(list.addEventListener).toHaveBeenCalledTimes(1)
  })

  it('suit un changement de réglage système en cours de partie, y compris en réactif', () => {
    const media = stubMatchMedia(false)
    const reactive = useReducedMotion()
    expect(reactive.value).toBe(false)

    media.change(true)

    expect(prefersReducedMotion()).toBe(true)
    expect(reactive.value).toBe(true)
  })

  it('sans matchMedia, le mouvement reste permis', () => {
    vi.stubGlobal('matchMedia', undefined)

    expect(prefersReducedMotion()).toBe(false)
  })
})
