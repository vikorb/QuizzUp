import {
  createDemoSynthPlayer,
  createRoutingExtractPlayer,
  getDemoMelody,
  isDemoMediaUrl,
} from '@/audio/demoSynthPlayer'
import { createSilentExtractPlayer, type ExtractPlayer } from '@/audio/player'

function param() {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  }
}

function fakeContext() {
  const oscillators: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = []
  const gains: { gain: ReturnType<typeof param> }[] = []
  const context = {
    state: 'running',
    currentTime: 0,
    destination: {},
    resume: vi.fn(async () => undefined),
    createGain: () => {
      const node = { gain: param(), connect: vi.fn() }
      gains.push(node)
      return node
    },
    createOscillator: () => {
      const node = {
        type: 'sine',
        frequency: param(),
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }
      oscillators.push(node)
      return node
    },
  }
  return { context: context as unknown as AudioContext, raw: context, oscillators, gains }
}

function manualScheduler() {
  let now = 0
  const timers = new Map<number, { at: number; callback: () => void }>()
  let nextId = 1
  return {
    now: () => now,
    setTimeout: (callback: () => void, ms: number) => {
      const id = nextId++
      timers.set(id, { at: now + ms, callback })
      return id
    },
    clearTimeout: (handle: unknown) => timers.delete(handle as number),
    advance(ms: number) {
      now += ms
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id)
          timer.callback()
        }
      }
    },
  }
}

describe('extraits de démo synthétisés', () => {
  it('donne toujours la même mélodie pour une URL', () => {
    const first = getDemoMelody('demo://9001/1')
    const again = getDemoMelody('demo://9001/1')
    const other = getDemoMelody('demo://9002/4')
    const notes = (melody: typeof first) =>
      Array.from({ length: 32 }, (_unused, step) => melody.frequencyAt(step))

    expect(notes(again)).toEqual(notes(first))
    expect(notes(other)).not.toEqual(notes(first))
    expect(notes(first).filter((note) => note !== null).length).toBeGreaterThan(10)
    expect(isDemoMediaUrl('demo://1/1')).toBe(true)
    expect(isDemoMediaUrl('https://x')).toBe(false)
  })

  it('joue un palier, se met en pause, reprend et finit à la bonne durée', async () => {
    const { context, oscillators } = fakeContext()
    const scheduler = manualScheduler()
    const player = createDemoSynthPlayer(() => context, scheduler)

    const outcome = player.play('demo://9001/1', 0, 5000)
    expect(oscillators.length).toBeGreaterThan(5)

    scheduler.advance(2000)
    expect(player.pause()).toBe(2000)
    expect(oscillators.every((node) => node.stop.mock.calls.length > 0)).toBe(true)

    scheduler.advance(10_000) // un joueur répond : rien ne joue
    player.resume()
    scheduler.advance(2999)
    player.pause()
    player.resume()
    scheduler.advance(1)

    await expect(outcome).resolves.toBe('ended')
    expect(player.isLoaded('demo://9001/1')).toBe(true)
  })

  it('fond le volume à l’entrée et à la coupure, sans toucher à la durée du palier', async () => {
    const { context, raw, oscillators, gains } = fakeContext()
    const scheduler = manualScheduler()
    const player = createDemoSynthPlayer(() => context, scheduler)

    const outcome = player.play('demo://9001/1', 0, 5000)
    const master = gains[0]!.gain

    // Montée du volume général (40 ms) à partir du silence, au démarrage prévu du son.
    expect(master.setValueAtTime).toHaveBeenCalledWith(0, 0.01)
    expect(master.linearRampToValueAtTime).toHaveBeenCalledWith(0.22, 0.05)

    // Coupure à 1,5 s : descente en 60 ms puis arrêt des oscillateurs juste après, pas net.
    raw.currentTime = 1.5
    scheduler.advance(1500)
    player.pause()

    expect(master.cancelScheduledValues).toHaveBeenCalledWith(1.5)
    expect(master.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 1.56)
    for (const node of oscillators) {
      expect(node.stop).toHaveBeenLastCalledWith(1.57)
    }

    // Le minuteur du palier n'est pas décalé par les fondus : il reste 3,5 s.
    player.resume()
    scheduler.advance(3499)
    let settled = false
    void outcome.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    scheduler.advance(1)
    await expect(outcome).resolves.toBe('ended')
  })

  it('garde le volume à zéro avant la montée, même si on coupe aussitôt', () => {
    const { context, gains, oscillators } = fakeContext()
    const player = createDemoSynthPlayer(() => context, manualScheduler())

    player.play('demo://9001/1', 0, 5000)
    player.stop()

    const master = gains[0]!.gain
    expect(master.setValueAtTime.mock.calls[0]).toEqual([0, 0])
    expect(master.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 0.06)
    for (const node of oscillators) {
      expect(node.stop.mock.lastCall?.[0]).toBeCloseTo(0.07, 6)
    }
  })

  it('résout « stopped » à l’arrêt ou quand un autre palier démarre', async () => {
    const { context } = fakeContext()
    const player = createDemoSynthPlayer(() => context, manualScheduler())

    const first = player.play('demo://1/1', 0, 1000)
    const second = player.play('demo://1/2', 0, 1000)
    player.stop()

    await expect(first).resolves.toBe('stopped')
    await expect(second).resolves.toBe('stopped')
    await expect(player.play('demo://1/3', 0, 0)).resolves.toBe('ended')
    expect(player.pause()).toBe(0)
  })

  it('aiguille les extraits de démo vers la synthèse et les autres vers Web Audio', async () => {
    const main: ExtractPlayer = { ...createSilentExtractPlayer(), isLoaded: () => false }
    const demo = createSilentExtractPlayer()
    const mainPlay = vi.spyOn(main, 'play')
    const demoPlay = vi.spyOn(demo, 'play')
    const preload = vi.spyOn(main, 'preload')
    const router = createRoutingExtractPlayer(main, demo)

    await router.preload(['demo://1/1', 'https://media/1'])
    expect(preload).toHaveBeenCalledWith(['https://media/1'], undefined)

    void router.play('demo://1/1', 0, 1000)
    void router.play('https://media/1', 0, 1000)
    expect(demoPlay).toHaveBeenCalledTimes(1)
    expect(mainPlay).toHaveBeenCalledTimes(1)
    expect(router.isLoaded('demo://1/1')).toBe(true)
    expect(router.isLoaded('https://media/1')).toBe(false)
    router.stop()
  })
})
