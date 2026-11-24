import type { GameEvent } from '@quizzup/game-engine'

import { createAudioBridge } from '@/audio/audioBridge'
import { createSilentExtractPlayer, type ExtractPlayer } from '@/audio/player'
import { flushRoomErrors } from '@/diagnostics/errorReporter'
import { setRoomToken } from '@/utils/auth'

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

  it('note l’extrait illisible pour le personnel, en avertissement', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }))
    setRoomToken('tok')
    const player = fakePlayer()
    // Le message d'erreur du lecteur contient l'adresse du média : il ne part jamais au journal.
    vi.mocked(player.play).mockRejectedValueOnce(
      new Error('Extrait illisible : https://media.example/x.mp3?token=secret')
    )

    createAudioBridge(player).handleEvents([
      event('blind_test_stage_started', { mediaUrl: 'x.mp3', mediaStartMs: 0, extractMs: 1000 }),
    ])
    await new Promise((resolve) => setTimeout(resolve, 0))
    await flushRoomErrors()
    setRoomToken(null)

    const body = String(fetchMock.mock.calls[0]?.[1]?.body)
    const sent = JSON.parse(body) as { entries: unknown[] }
    expect(sent.entries).toMatchObject([
      { level: 'warn', code: 'audio_play_failed', message: 'audio_play_failed' },
    ])
    expect(body).not.toContain('media.example')
    expect(body).not.toContain('secret')
    fetchMock.mockRestore()
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

  it.each(['reverse', 'slowed', 'short'] as const)(
    'passe l’effet %s au lecteur sans toucher au point de départ ni à la durée',
    (audioEffect) => {
      const player = fakePlayer()
      createAudioBridge(player).handleEvents([
        event('blind_test_stage_started', {
          mediaUrl: 'a.mp3',
          mediaStartMs: 12_500,
          extractMs: 5000,
          audioEffect,
        }),
      ])
      expect(player.play).toHaveBeenCalledWith('a.mp3', 12.5, 5000, { effect: audioEffect })
    }
  )

  it.each([
    ['sans champ', {}],
    ['nul', { audioEffect: null }],
    ['none', { audioEffect: 'none' }],
    ['inconnu', { audioEffect: 'echo' }],
    ['du mauvais type', { audioEffect: 42 }],
  ])('joue comme avant un extrait dont l’effet est %s', (_label, extra) => {
    const player = fakePlayer()
    createAudioBridge(player).handleEvents([
      event('blind_test_stage_started', {
        mediaUrl: 'a.mp3',
        mediaStartMs: 12_500,
        extractMs: 5000,
        ...extra,
      }),
    ])
    expect(player.play).toHaveBeenCalledOnce()
    expect(player.play).toHaveBeenCalledWith('a.mp3', 12.5, 5000)
  })

  it('reprise avec un effet : le lecteur reçoit le palier entier et le temps déjà joué', () => {
    const player = fakePlayer()
    const bridge = createAudioBridge(player)

    bridge.restore({
      mediaUrl: 'a.mp3',
      mediaStartMs: 2000,
      audioEffect: 'slowed',
      extractMs: 20_000,
      elapsedMs: 5000,
      paused: true,
    })
    expect(player.play).toHaveBeenCalledWith('a.mp3', 2, 20_000, {
      effect: 'slowed',
      elapsedMs: 5000,
    })
    expect(player.pause).toHaveBeenCalled()

    bridge.restore({
      mediaUrl: 'a.mp3',
      mediaStartMs: 2000,
      audioEffect: 'slowed',
      extractMs: 1000,
      elapsedMs: 1000,
      paused: false,
    })
    expect(player.play).toHaveBeenCalledTimes(1)
  })

  it('reprise avec un effet inconnu ou absent : calcul d’avant', () => {
    const player = fakePlayer()
    const bridge = createAudioBridge(player)
    const base = { mediaUrl: 'a.mp3', mediaStartMs: 2000, extractMs: 20_000, elapsedMs: 5000 }

    bridge.restore({ ...base, audioEffect: 'echo', paused: false })
    bridge.restore({ ...base, paused: false })
    expect(player.play).toHaveBeenNthCalledWith(1, 'a.mp3', 7, 15_000)
    expect(player.play).toHaveBeenNthCalledWith(2, 'a.mp3', 7, 15_000)
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

const stage = (mediaUrl: string) => ({
  type: 'blind_test_stage_started',
  at: 0,
  payload: { mediaUrl, mediaStartMs: 0, extractMs: 1000 },
})

describe('extraits jouables', () => {
  it('ne joue ni les extraits de démo ni ceux qui ne sont pas préchargés', () => {
    const player = createSilentExtractPlayer()
    const play = vi.spyOn(player, 'play')
    player.isLoaded = (url: string) => url === 'https://media.test/ok'
    const bridge = createAudioBridge(player)
    bridge.handleEvents([stage('demo://1/1'), stage('https://media.test/absent')] as never)
    expect(play).not.toHaveBeenCalled()
    bridge.handleEvents([stage('https://media.test/ok')] as never)
    expect(play).toHaveBeenCalledWith('https://media.test/ok', 0, 1000)
  })
})
