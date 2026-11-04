import {
  enterFullscreen,
  exitFullscreen,
  isFullscreen,
  keepScreenAwake,
  releaseScreenAwake,
} from '@/hardware/screen'

function fakeDocument(options: { fullscreen?: boolean; fails?: boolean } = {}) {
  const doc = {
    fullscreenElement: options.fullscreen ? {} : null,
    documentElement: {
      requestFullscreen: vi.fn(async () => {
        if (options.fails) {
          throw new Error('denied')
        }
        doc.fullscreenElement = {}
      }),
    },
    exitFullscreen: vi.fn(async () => {
      doc.fullscreenElement = null
    }),
  }
  return doc as unknown as Document & { exitFullscreen: ReturnType<typeof vi.fn> }
}

describe('écran kiosque', () => {
  it('passe en plein écran, ou signale le refus du navigateur', async () => {
    const doc = fakeDocument()
    await expect(enterFullscreen(doc)).resolves.toBe(true)
    expect(isFullscreen(doc)).toBe(true)
    await expect(enterFullscreen(doc)).resolves.toBe(true)

    await exitFullscreen(doc)
    expect(isFullscreen(doc)).toBe(false)
    await exitFullscreen(doc)
    expect(doc.exitFullscreen).toHaveBeenCalledTimes(1)

    await expect(enterFullscreen(fakeDocument({ fails: true }))).resolves.toBe(false)
  })

  it('garde l’écran allumé puis relâche le verrou', async () => {
    const release = vi.fn(async () => undefined)
    const nav = { wakeLock: { request: vi.fn(async () => ({ release })) } } as unknown as Navigator

    await expect(keepScreenAwake(nav)).resolves.toBe(true)
    await releaseScreenAwake()
    expect(release).toHaveBeenCalled()

    await expect(keepScreenAwake({} as Navigator)).resolves.toBe(false)
    await expect(
      keepScreenAwake({
        wakeLock: { request: vi.fn(async () => Promise.reject(new Error('no'))) },
      } as unknown as Navigator)
    ).resolves.toBe(false)
  })
})
