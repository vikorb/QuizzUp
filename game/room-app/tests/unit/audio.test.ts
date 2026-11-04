import type { GameEvent } from '@quizzup/game-engine'

import { createAudioBridge } from '@/audio/audioBridge'
import { createSilentExtractPlayer, type ExtractPlayer } from '@/audio/player'

function event(type: GameEvent['type'], payload: Record<string, unknown> = {}): GameEvent {
  return { seq: 0, type, at: 0, payload }
}

function fakePlayer(): ExtractPlayer & Record<string, ReturnType<typeof vi.fn>> {
  return {
    unlock: vi.fn(async () => undefined),
    preload: vi.fn(async () => ({ loaded: [], failed: [] })),
    play: vi.fn(async () => 'ended' as const),
    pause: vi.fn(() => 0),
    resume: vi.fn(),
    stop: vi.fn(),
    isLoaded: vi.fn(() => true),
    release: vi.fn(),
  }
}

describe('audioBridge', () => {
  it('joue l’extrait du palier depuis son point de départ', () => {
    const player = fakePlayer()
    createAudioBridge(player).handleEvents([
      event('blind_test_stage_started', {
        mediaUrl: 'a.mp3',
        mediaStartMs: 12_500,
        extractMs: 5000,
      }),
    ])
    expect(player.play).toHaveBeenCalledWith('a.mp3', 12.5, 5000)
  })

  it('met en pause au buzz et ne reprend que si l’extrait n’était pas fini', () => {
    const player = fakePlayer()
    const bridge = createAudioBridge(player)
    bridge.handleEvents([
      event('blind_test_stage_started', { mediaUrl: 'a.mp3', mediaStartMs: 0, extractMs: 1000 }),
      event('blind_test_paused'),
      event('blind_test_stage_resumed', { elapsedMs: 400 }),
      event('blind_test_stage_resumed', { elapsedMs: 2500 }),
    ])
    expect(player.pause).toHaveBeenCalledTimes(1)
    expect(player.resume).toHaveBeenCalledTimes(1)
  })

  it('coupe le son à la bonne réponse, en fin de question et de partie', () => {
    const player = fakePlayer()
    createAudioBridge(player).handleEvents([
      event('answer_correct'),
      event('question_ended'),
      event('game_aborted'),
      event('game_ended'),
      event('round_started'),
    ])
    expect(player.stop).toHaveBeenCalledTimes(4)
  })

  it('ignore un extrait illisible sans casser la partie', async () => {
    const player = fakePlayer()
    vi.mocked(player.play).mockRejectedValueOnce(new Error('decode'))
    createAudioBridge(player).handleEvents([
      event('blind_test_stage_started', { mediaUrl: 'x.mp3', mediaStartMs: 0, extractMs: 1000 }),
    ])
    await Promise.resolve()
    expect(player.play).toHaveBeenCalled()
  })

  it('relance l’extrait en cours après une reprise, en pause si un joueur répondait', () => {
    const player = fakePlayer()
    const bridge = createAudioBridge(player)

    bridge.restore({
      mediaUrl: 'a.mp3',
      mediaStartMs: 2000,
      extractMs: 20_000,
      elapsedMs: 5000,
      paused: true,
    })
    expect(player.play).toHaveBeenCalledWith('a.mp3', 7, 15_000)
    expect(player.pause).toHaveBeenCalled()

    // Reprise de la fenêtre de buzz : l'extrait n'était pas fini, il repart.
    bridge.handleEvents([event('blind_test_stage_resumed', { elapsedMs: 6000 })])
    expect(player.resume).toHaveBeenCalled()

    bridge.restore({
      mediaUrl: 'a.mp3',
      mediaStartMs: 0,
      extractMs: 1000,
      elapsedMs: 2000,
      paused: false,
    })
    expect(player.play).toHaveBeenCalledTimes(1)
  })

  it('ne joue rien sans média', () => {
    const player = fakePlayer()
    createAudioBridge(player).handleEvents([
      event('blind_test_stage_started', { mediaUrl: null, extractMs: 1000 }),
    ])
    expect(player.play).not.toHaveBeenCalled()
  })
})

describe('createSilentExtractPlayer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('respecte la durée du palier, pauses déduites', async () => {
    const player = createSilentExtractPlayer({
      now: () => Date.now(),
      setTimeout: (callback, ms) => setTimeout(callback, ms),
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    })
    const outcome = vi.fn()
    void player.play('demo://1', 0, 1000).then(outcome)

    vi.advanceTimersByTime(400)
    expect(player.pause()).toBe(400)
    vi.advanceTimersByTime(5000)
    expect(outcome).not.toHaveBeenCalled()

    player.resume()
    vi.advanceTimersByTime(600)
    await Promise.resolve()
    expect(outcome).toHaveBeenCalledWith('ended')
  })

  it('se résout « stopped » à l’arrêt ou au palier suivant', async () => {
    const player = createSilentExtractPlayer()
    const first = player.play('demo://1', 0, 1000)
    const second = player.play('demo://1', 0, 5000)
    player.stop()

    await expect(first).resolves.toBe('stopped')
    await expect(second).resolves.toBe('stopped')
    await expect(player.preload(['a', 'b'])).resolves.toEqual({ loaded: ['a', 'b'], failed: [] })
  })
})
