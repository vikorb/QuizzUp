/**
 * Boucle d'animation simulée : `requestAnimationFrame` ne tourne que quand le test appelle `tick`.
 * À défaire avec `vi.unstubAllGlobals()` en `afterEach`.
 */
export function installFakeAnimationFrames() {
  let nextId = 1
  const callbacks = new Map<number, FrameRequestCallback>()
  const request = vi.fn((callback: FrameRequestCallback) => {
    const id = nextId++
    callbacks.set(id, callback)
    return id
  })
  const cancel = vi.fn((id: number) => {
    callbacks.delete(id)
  })
  vi.stubGlobal('requestAnimationFrame', request)
  vi.stubGlobal('cancelAnimationFrame', cancel)

  return {
    request,
    cancel,
    /** Images demandées et pas encore jouées ni annulées. */
    get pending(): number {
      return callbacks.size
    },
    /** Joue les images en attente, à l'instant `time` (ms). */
    tick(time: number): void {
      const due = [...callbacks.values()]
      callbacks.clear()
      for (const callback of due) {
        callback(time)
      }
    },
  }
}

/** Simule la préférence système « réduire les animations » (`matchMedia`). */
export function stubReducedMotion(reduce: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
    }))
  )
}
