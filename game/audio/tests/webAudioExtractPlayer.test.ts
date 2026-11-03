import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WebAudioExtractPlayer } from '../src/index'
import {
  ControlledFetch,
  FakeAudioContext,
  audioResponse,
  flush,
  tableFetch,
  track,
} from './fakeAudioContext'

const SONG = '/questions/1/media'
const SHORT = '/questions/2/media'
const OTHER = '/questions/3/media'

let ctx: FakeAudioContext
let files: ReturnType<typeof tableFetch>

function createPlayer(options: { fadeMs?: number; volume?: number } = {}) {
  return new WebAudioExtractPlayer({
    createContext: () => ctx.asAudioContext(),
    fetch: files.fetch,
    ...options,
  })
}

async function loadedPlayer(options: { fadeMs?: number; volume?: number } = {}) {
  const player = createPlayer(options)
  await player.unlock()
  await player.preload([SONG, SHORT, OTHER])
  return player
}

beforeEach(() => {
  ctx = new FakeAudioContext()
  files = tableFetch({ [SONG]: 180, [SHORT]: 4, [OTHER]: 60 })
})

describe('unlock', () => {
  it('crée le contexte à la demande et le reprend s’il est suspendu', async () => {
    const createContext = vi.fn(() => ctx.asAudioContext())
    const player = new WebAudioExtractPlayer({ createContext })
    expect(createContext).not.toHaveBeenCalled()

    await player.unlock()

    expect(createContext).toHaveBeenCalledTimes(1)
    expect(ctx.resumeCalls).toBe(1)
    expect(ctx.state).toBe('running')
  })

  it('n’appelle pas resume() si le contexte tourne déjà, et réutilise le même contexte', async () => {
    const createContext = vi.fn(() => ctx.asAudioContext())
    const player = new WebAudioExtractPlayer({ createContext })
    ctx.state = 'running'

    await player.unlock()
    await player.unlock()

    expect(ctx.resumeCalls).toBe(0)
    expect(createContext).toHaveBeenCalledTimes(1)
    expect(player.getContext()).toBe(ctx.asAudioContext())
  })
})

describe('contexte audio non démarré', () => {
  it('play() rejette explicitement si le contexte est fermé', async () => {
    const player = await loadedPlayer()
    ctx.state = 'closed'

    await expect(player.play(SONG, 0, 1000)).rejects.toThrow(/AudioContext fermé/)
    expect(ctx.sources).toHaveLength(0)
    expect(player.pause()).toBe(0)
  })

  it('unlock() sur un contexte fermé en recrée un neuf et garde les buffers', async () => {
    const first = ctx
    const second = new FakeAudioContext()
    const contexts = [first, second]
    const createContext = vi.fn(() => (contexts.shift() as FakeAudioContext).asAudioContext())
    const player = new WebAudioExtractPlayer({ createContext, fetch: files.fetch })
    await player.unlock()
    await player.preload([SONG])
    const pending = track(player.play(SONG, 0, 5000))
    first.state = 'closed'

    await player.unlock()
    await flush()

    expect(pending.value).toBe('stopped')
    expect(createContext).toHaveBeenCalledTimes(2)
    expect(player.getContext()).toBe(second.asAudioContext())
    expect(second.state).toBe('running')
    const outcome = track(player.play(SONG, 0, 1000))
    expect(second.lastSource().startCall).toEqual({ when: 0, offset: 0, duration: 1 })
    expect(files.calls).toEqual([SONG])
    second.advance(1)
    await flush()
    expect(outcome.value).toBe('ended')
  })

  it('play() sur un contexte suspendu tente resume() puis joue le palier', async () => {
    const player = createPlayer()
    await player.preload([SONG])
    expect(ctx.state).toBe('suspended')

    const outcome = track(player.play(SONG, 0, 1000))
    await flush()

    expect(ctx.resumeCalls).toBe(1)
    expect(ctx.state).toBe('running')
    ctx.advance(1)
    await flush()
    expect(outcome.value).toBe('ended')
  })

  it('play() rejette si le contexte suspendu refuse de reprendre', async () => {
    const player = createPlayer()
    await player.preload([SONG])
    ctx.resume = vi.fn(async () => {
      throw new Error('NotAllowedError')
    })

    await expect(player.play(SONG, 0, 1000)).rejects.toThrow(/impossible à reprendre/)
    expect(player.pause()).toBe(0)
  })
})

describe('contexte bloqué par le navigateur', () => {
  it('play() abandonne si resume() reste en attente (pas de geste utilisateur)', async () => {
    vi.useFakeTimers()
    try {
      const player = createPlayer()
      await player.preload([SONG])
      ctx.resume = vi.fn(() => new Promise<void>(() => {}))

      const outcome = player.play(SONG, 0, 1000)
      const assertion = expect(outcome).rejects.toThrow(/délai dépassé/)
      await vi.advanceTimersByTimeAsync(2000)

      await assertion
      expect(player.pause()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('preload', () => {
  it('télécharge, décode et garde les buffers en mémoire', async () => {
    const player = createPlayer()

    const result = await player.preload([SONG, SHORT])

    expect(result).toEqual({ loaded: [SONG, SHORT], failed: [] })
    expect(player.isLoaded(SONG)).toBe(true)
    expect(player.isLoaded(SHORT)).toBe(true)
    expect(player.isLoaded(OTHER)).toBe(false)
    expect(ctx.decodeCalls).toBe(2)
  })

  it('utilise le fetch injecté (ex. avec en-tête Authorization)', async () => {
    const authFetch = vi.fn(async (url: string) => {
      void url
      return audioResponse(10)
    })
    const player = new WebAudioExtractPlayer({ createContext: () => ctx.asAudioContext() })

    await player.preload([SONG], { fetch: authFetch })

    expect(authFetch).toHaveBeenCalledWith(SONG)
    expect(player.isLoaded(SONG)).toBe(true)
  })

  it('ne rejette jamais : renvoie les échecs réseau, HTTP et de décodage', async () => {
    files = tableFetch({ ok: 10, down: 'network', missing: 404, corrupt: 'corrupt' })
    const player = createPlayer()

    const result = await player.preload(['ok', 'down', 'missing', 'corrupt'])

    expect(result).toEqual({ loaded: ['ok'], failed: ['down', 'missing', 'corrupt'] })
    expect(player.isLoaded('down')).toBe(false)
    expect(player.isLoaded('corrupt')).toBe(false)
  })

  it('ne rejette pas si la création du contexte échoue', async () => {
    const player = new WebAudioExtractPlayer({
      createContext: () => {
        throw new Error('pas de Web Audio')
      },
      fetch: files.fetch,
    })

    await expect(player.preload([SONG])).resolves.toEqual({ loaded: [], failed: [SONG] })
  })

  it('signale la progression pour chaque URL traitée, succès ou échec', async () => {
    files = tableFetch({ a: 1, b: 'network', c: 2 })
    const onProgress = vi.fn()

    await createPlayer().preload(['a', 'b', 'c'], { onProgress, concurrency: 1 })

    expect(onProgress.mock.calls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ])
  })

  it('ignore un callback de progression qui lève une erreur', async () => {
    const onProgress = () => {
      throw new Error('boom')
    }
    await expect(createPlayer().preload([SONG], { onProgress })).resolves.toEqual({
      loaded: [SONG],
      failed: [],
    })
  })

  it('limite les téléchargements simultanés à 3 par défaut', async () => {
    const controlled = new ControlledFetch()
    const player = createPlayer()
    const urls = ['u1', 'u2', 'u3', 'u4', 'u5']

    const result = track(player.preload(urls, { fetch: controlled.fetch }))
    await flush()
    expect(controlled.inFlight()).toEqual(['u1', 'u2', 'u3'])

    controlled.respond('u2', audioResponse(1))
    await flush()
    expect(controlled.inFlight()).toEqual(['u1', 'u3', 'u4'])

    controlled.fail('u1')
    controlled.respond('u3', audioResponse(1))
    controlled.respond('u4', audioResponse(1))
    await flush()
    expect(controlled.inFlight()).toEqual(['u5'])
    controlled.respond('u5', audioResponse(1))
    await flush()

    expect(result.value).toEqual({ loaded: ['u2', 'u3', 'u4', 'u5'], failed: ['u1'] })
  })

  it('respecte une concurrence personnalisée', async () => {
    const controlled = new ControlledFetch()
    const player = createPlayer()

    void player.preload(['a', 'b', 'c'], { fetch: controlled.fetch, concurrency: 1 })
    await flush()
    expect(controlled.inFlight()).toEqual(['a'])

    controlled.respond('a', audioResponse(1))
    await flush()
    expect(controlled.inFlight()).toEqual(['b'])
  })

  it('ramène une concurrence invalide à une valeur utilisable', async () => {
    const controlled = new ControlledFetch()
    void createPlayer().preload(['a', 'b'], { fetch: controlled.fetch, concurrency: 0 })
    await flush()
    expect(controlled.inFlight()).toEqual(['a'])
  })

  it('ne recharge pas une URL déjà décodée et dédoublonne la liste', async () => {
    const player = createPlayer()
    await player.preload([SONG])

    const result = await player.preload([SONG, SHORT, SHORT])

    expect(files.calls).toEqual([SONG, SHORT])
    expect(result).toEqual({ loaded: [SONG, SHORT], failed: [] })
  })

  it('fusionne deux préchargements simultanés de la même URL', async () => {
    const player = createPlayer()

    await Promise.all([player.preload([SONG]), player.preload([SONG])])

    expect(files.calls).toEqual([SONG])
    expect(ctx.decodeCalls).toBe(1)
  })

  it('accepte une liste vide', async () => {
    const onProgress = vi.fn()
    await expect(createPlayer().preload([], { onProgress })).resolves.toEqual({
      loaded: [],
      failed: [],
    })
    expect(onProgress).not.toHaveBeenCalled()
  })

  it('retente une URL en échec au préchargement suivant', async () => {
    files = tableFetch({ flaky: 'network' })
    const player = createPlayer()
    await player.preload(['flaky'])

    await player.preload(['flaky'])

    expect(files.calls).toEqual(['flaky', 'flaky'])
  })
})

describe('release', () => {
  it('libère les URLs demandées', async () => {
    const player = await loadedPlayer()
    player.release([SONG])
    expect(player.isLoaded(SONG)).toBe(false)
    expect(player.isLoaded(SHORT)).toBe(true)
  })

  it('libère tout sans argument', async () => {
    const player = await loadedPlayer()
    player.release()
    expect([SONG, SHORT, OTHER].some((url) => player.isLoaded(url))).toBe(false)
  })

  it('ne garde pas un buffer libéré pendant son chargement', async () => {
    const controlled = new ControlledFetch()
    const player = createPlayer()
    const result = track(player.preload([SONG], { fetch: controlled.fetch }))
    await flush()

    player.release([SONG])
    controlled.respond(SONG, audioResponse(10))
    await flush()

    expect(result.value).toEqual({ loaded: [SONG], failed: [] })
    expect(player.isLoaded(SONG)).toBe(false)
  })
})

describe('play', () => {
  it('planifie le palier sur l’horloge audio et se résout « ended » à la fin exacte', async () => {
    const player = await loadedPlayer()
    ctx.currentTime = 2

    const outcome = track(player.play(SONG, 42, 5000))

    const source = ctx.lastSource()
    expect(source.startCall).toEqual({ when: 2, offset: 42, duration: 5 })
    ctx.advance(4.999)
    await flush()
    expect(outcome.settled).toBe(false)

    ctx.advance(0.001)
    await flush()
    expect(outcome.value).toBe('ended')
  })

  it('n’utilise pas setTimeout pour la fin du palier', async () => {
    const player = await loadedPlayer()
    const spy = vi.spyOn(globalThis, 'setTimeout')

    void player.play(SONG, 0, 1000)

    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('enchaîne les paliers 1 s, 5 s, 20 s depuis le même point de départ', async () => {
    const player = await loadedPlayer()

    for (const durationMs of [1000, 5000, 20000]) {
      const outcome = player.play(SONG, 30, durationMs)
      ctx.advance(durationMs / 1000)
      await expect(outcome).resolves.toBe('ended')
    }

    expect(ctx.startedSources().map((source) => source.startCall)).toEqual([
      { when: 0, offset: 30, duration: 1 },
      { when: 1, offset: 30, duration: 5 },
      { when: 6, offset: 30, duration: 20 },
    ])
  })

  it('charge à la volée une URL non préchargée', async () => {
    const player = createPlayer()
    await player.unlock()

    const outcome = track(player.play(SONG, 0, 1000))
    expect(ctx.sources).toHaveLength(0)
    await flush()

    expect(player.isLoaded(SONG)).toBe(true)
    expect(ctx.lastSource().startCall).toEqual({ when: 0, offset: 0, duration: 1 })
    ctx.advance(1)
    await flush()
    expect(outcome.value).toBe('ended')
  })

  it('réutilise le fetch du dernier préchargement pour les chargements à la volée', async () => {
    const authFetch = vi.fn(async () => audioResponse(10))
    const player = new WebAudioExtractPlayer({ createContext: () => ctx.asAudioContext() })
    await player.preload([], { fetch: authFetch })

    void player.play(SONG, 0, 1000)
    await flush()

    expect(authFetch).toHaveBeenCalledWith(SONG)
  })

  it('rejette si le chargement à la volée échoue', async () => {
    files = tableFetch({ broken: 'corrupt' })
    const player = createPlayer()

    await expect(player.play('broken', 0, 1000)).rejects.toThrow(/décoder/)
    expect(player.pause()).toBe(0)
  })

  it('termine en « ended » à la fin du fichier s’il est plus court que le palier', async () => {
    const player = await loadedPlayer()

    const outcome = track(player.play(SHORT, 3, 5000))

    expect(ctx.lastSource().startCall).toEqual({ when: 0, offset: 3, duration: 1 })
    ctx.advance(1)
    await flush()
    expect(outcome.value).toBe('ended')
  })

  it('se résout « ended » tout de suite si le départ est après la fin du fichier', async () => {
    const player = await loadedPlayer()
    await expect(player.play(SHORT, 10, 5000)).resolves.toBe('ended')
    expect(ctx.sources).toHaveLength(0)
  })

  it.each([-5, Number.NaN, Number.NEGATIVE_INFINITY])(
    'ramène un départ invalide (%s) à 0',
    async (startSec) => {
      const player = await loadedPlayer()
      void player.play(SONG, startSec, 1000)
      expect(ctx.lastSource().startCall?.offset).toBe(0)
    }
  )

  it.each([0, -100, Number.NaN])(
    'se résout « ended » immediatement si durationMs vaut %s',
    async (durationMs) => {
      const player = await loadedPlayer()
      await expect(player.play(SONG, 0, durationMs)).resolves.toBe('ended')
      expect(ctx.sources).toHaveLength(0)
    }
  )

  it('un nouveau play() interrompt le précédent en « stopped »', async () => {
    const player = await loadedPlayer()
    const first = track(player.play(SONG, 0, 5000))
    const firstSource = ctx.lastSource()
    ctx.advance(0.5)

    const second = track(player.play(OTHER, 10, 1000))
    await flush()

    expect(first.value).toBe('stopped')
    expect(firstSource.stopTime).toBeCloseTo(0.515)
    expect(ctx.lastSource().startCall).toEqual({ when: 0.5, offset: 10, duration: 1 })

    ctx.advance(1)
    await flush()
    expect(second.value).toBe('ended')
  })

  it('l’onended tardif de la source interrompue ne termine pas le nouveau palier', async () => {
    const player = await loadedPlayer()
    void player.play(SONG, 0, 5000)
    const second = track(player.play(SONG, 0, 5000))

    ctx.advance(0.1)
    await flush()

    expect(second.settled).toBe(false)
  })

  it('un nouveau play() pendant un chargement à la volée annule le premier', async () => {
    const controlled = new ControlledFetch()
    const player = new WebAudioExtractPlayer({
      createContext: () => ctx.asAudioContext(),
      fetch: controlled.fetch,
    })
    const first = track(player.play('slow', 0, 1000))
    const second = track(player.play('slow2', 0, 1000))
    await flush()
    expect(first.value).toBe('stopped')

    controlled.respond('slow', audioResponse(10))
    controlled.respond('slow2', audioResponse(10))
    await flush()

    expect(ctx.startedSources()).toHaveLength(1)
    ctx.advance(1)
    await flush()
    expect(second.value).toBe('ended')
  })

  it('applique un fondu d’entrée et de sortie via un GainNode', async () => {
    const player = await loadedPlayer({ fadeMs: 20 })
    ctx.currentTime = 1

    void player.play(SONG, 0, 1000)

    const fadeGain = ctx.gains.at(-1)
    expect(fadeGain?.gain.events).toEqual([
      { type: 'set', value: 0, time: 1 },
      { type: 'linear', value: 1, time: 1.02 },
      { type: 'set', value: 1, time: 1.98 },
      { type: 'linear', value: 0, time: 2 },
    ])
    expect(ctx.lastSource().connections).toEqual([fadeGain])
  })

  it('raccourcit le fondu sur un palier très court et le supprime si fadeMs = 0', async () => {
    const player = await loadedPlayer({ fadeMs: 15 })
    void player.play(SONG, 0, 10)
    expect(ctx.gains.at(-1)?.gain.events[1]).toEqual({ type: 'linear', value: 1, time: 0.005 })

    const noFade = await loadedPlayer({ fadeMs: 0 })
    void noFade.play(SONG, 0, 1000)
    expect(ctx.gains.at(-1)?.gain.events).toEqual([{ type: 'set', value: 1, time: 0 }])
  })
})

describe('volume', () => {
  it('route tout vers un gain général réglé sur le volume', async () => {
    const player = await loadedPlayer({ volume: 0.5 })
    void player.play(SONG, 0, 1000)

    const master = ctx.gains[0]
    expect(master?.gain.value).toBe(0.5)
    expect(master?.connections).toEqual([ctx.destination])
    expect(ctx.gains.at(-1)?.connections).toEqual([master])
  })

  it('setVolume borne la valeur entre 0 et 1 et ignore NaN', async () => {
    const player = await loadedPlayer()
    void player.play(SONG, 0, 1000)
    const master = ctx.gains[0]

    player.setVolume(0.3)
    expect(master?.gain.value).toBe(0.3)
    player.setVolume(4)
    expect(master?.gain.value).toBe(1)
    player.setVolume(-1)
    expect(master?.gain.value).toBe(0)
    player.setVolume(Number.NaN)
    expect(player.getVolume()).toBe(0)
  })

  it('setVolume avant toute lecture est appliqué à la création du gain général', async () => {
    const player = await loadedPlayer()
    player.setVolume(0.25)
    void player.play(SONG, 0, 1000)
    expect(ctx.gains[0]?.gain.value).toBe(0.25)
  })
})

describe('stop', () => {
  it('arrête la lecture et résout « stopped »', async () => {
    const player = await loadedPlayer()
    const outcome = track(player.play(SONG, 0, 5000))
    const source = ctx.lastSource()
    ctx.advance(1)

    player.stop()
    await flush()

    expect(outcome.value).toBe('stopped')
    expect(source.stopTime).toBeCloseTo(1.015)
    ctx.advance(10)
    expect(source.disconnectCount).toBeGreaterThan(0)
  })

  it('ne fait rien si rien ne joue', async () => {
    const player = await loadedPlayer()
    expect(() => player.stop()).not.toThrow()
  })

  it('arrête un palier en cours de chargement sans le lancer ensuite', async () => {
    const controlled = new ControlledFetch()
    const player = new WebAudioExtractPlayer({
      createContext: () => ctx.asAudioContext(),
      fetch: controlled.fetch,
    })
    const outcome = track(player.play(SONG, 0, 1000))

    player.stop()
    controlled.respond(SONG, audioResponse(10))
    await flush()

    expect(outcome.value).toBe('stopped')
    expect(ctx.startedSources()).toHaveLength(0)
    expect(player.isLoaded(SONG)).toBe(true)
  })

  it('un stop() après la fin n’a aucun effet', async () => {
    const player = await loadedPlayer()
    const outcome = player.play(SONG, 0, 1000)
    ctx.advance(1)
    await expect(outcome).resolves.toBe('ended')
    expect(() => player.stop()).not.toThrow()
  })
})

describe('pause / resume', () => {
  it('pause renvoie les ms jouées, coupe la source et laisse la promesse en attente', async () => {
    const player = await loadedPlayer()
    ctx.currentTime = 10
    const outcome = track(player.play(SONG, 30, 5000))
    const source = ctx.lastSource()
    ctx.advance(1.25)

    expect(player.pause()).toBe(1250)

    expect(source.stopTime).toBeCloseTo(11.265)
    ctx.advance(20)
    await flush()
    expect(outcome.settled).toBe(false)
  })

  it('resume reprend au bon endroit pour le temps restant, puis « ended »', async () => {
    const player = await loadedPlayer()
    const outcome = track(player.play(SONG, 30, 5000))
    ctx.advance(2)
    player.pause()
    ctx.advance(7)

    player.resume()

    expect(ctx.lastSource().startCall).toEqual({ when: 9, offset: 32, duration: 3 })
    ctx.advance(2.999)
    await flush()
    expect(outcome.settled).toBe(false)
    ctx.advance(0.001)
    await flush()
    expect(outcome.value).toBe('ended')
  })

  it('cumule plusieurs pauses dans le même palier', async () => {
    const player = await loadedPlayer()
    const outcome = track(player.play(SONG, 0, 20000))
    ctx.advance(3)
    expect(player.pause()).toBe(3000)
    ctx.advance(5)
    player.resume()
    ctx.advance(4)
    expect(player.pause()).toBe(7000)
    player.resume()

    expect(ctx.lastSource().startCall).toEqual({ when: 12, offset: 7, duration: 13 })
    ctx.advance(13)
    await flush()
    expect(outcome.value).toBe('ended')
  })

  it('pause sans lecture renvoie 0', async () => {
    const player = await loadedPlayer()
    expect(player.pause()).toBe(0)
  })

  it('une double pause renvoie la même valeur sans rien casser', async () => {
    const player = await loadedPlayer()
    void player.play(SONG, 0, 5000)
    ctx.advance(1)
    expect(player.pause()).toBe(1000)
    ctx.advance(1)
    expect(player.pause()).toBe(1000)
  })

  it('resume sans pause ne crée pas de nouvelle source', async () => {
    const player = await loadedPlayer()
    player.resume()
    expect(ctx.sources).toHaveLength(0)

    void player.play(SONG, 0, 5000)
    player.resume()
    expect(ctx.sources).toHaveLength(1)
  })

  it('stop pendant la pause résout « stopped »', async () => {
    const player = await loadedPlayer()
    const outcome = track(player.play(SONG, 0, 5000))
    ctx.advance(1)
    player.pause()

    player.stop()
    await flush()

    expect(outcome.value).toBe('stopped')
    player.resume()
    expect(ctx.sources).toHaveLength(1)
  })

  it('un nouveau play() pendant la pause interrompt le palier en pause', async () => {
    const player = await loadedPlayer()
    const first = track(player.play(SONG, 0, 5000))
    ctx.advance(1)
    player.pause()

    void player.play(OTHER, 0, 1000)
    await flush()

    expect(first.value).toBe('stopped')
    expect(ctx.startedSources()).toHaveLength(2)
  })

  it('pause pendant le chargement : rien ne démarre avant resume()', async () => {
    const controlled = new ControlledFetch()
    const player = new WebAudioExtractPlayer({
      createContext: () => ctx.asAudioContext(),
      fetch: controlled.fetch,
    })
    const outcome = track(player.play(SONG, 5, 1000))

    expect(player.pause()).toBe(0)
    controlled.respond(SONG, audioResponse(10))
    await flush()
    expect(ctx.startedSources()).toHaveLength(0)

    ctx.advance(3)
    player.resume()
    expect(ctx.lastSource().startCall).toEqual({ when: 3, offset: 5, duration: 1 })
    ctx.advance(1)
    await flush()
    expect(outcome.value).toBe('ended')
  })

  it('pause puis resume avant la fin du chargement : le palier démarre au chargement', async () => {
    const controlled = new ControlledFetch()
    const player = new WebAudioExtractPlayer({
      createContext: () => ctx.asAudioContext(),
      fetch: controlled.fetch,
    })
    void player.play(SONG, 0, 1000)
    player.pause()
    player.resume()

    controlled.respond(SONG, audioResponse(10))
    await flush()

    expect(ctx.startedSources()).toHaveLength(1)
  })

  it('pause après l’échéance mais avant onended : termine le palier en « ended »', async () => {
    const player = await loadedPlayer()
    const outcome = track(player.play(SONG, 0, 1000))
    ctx.currentTime = 1.2 // l'horloge a dépassé la fin, onended pas encore livré

    expect(player.pause()).toBe(1000)
    await flush()

    expect(outcome.value).toBe('ended')
    expect(player.pause()).toBe(0)
    player.resume()
    expect(ctx.sources).toHaveLength(1)
  })

  it('pause pile à l’échéance après une reprise : « ended » et durée totale', async () => {
    const player = await loadedPlayer()
    const outcome = track(player.play(SONG, 0, 3000))
    ctx.advance(1)
    player.pause()
    player.resume()
    ctx.currentTime = 3 // fin réelle atteinte, onended pas encore livré

    expect(player.pause()).toBe(3000)
    await flush()

    expect(outcome.value).toBe('ended')
  })

  it('pause sur un fichier trop court borne le temps restant à la fin du fichier', async () => {
    const player = await loadedPlayer()
    const outcome = track(player.play(SHORT, 2, 5000))
    ctx.advance(1.5)
    expect(player.pause()).toBe(1500)

    player.resume()

    expect(ctx.lastSource().startCall).toEqual({ when: 1.5, offset: 3.5, duration: 0.5 })
    ctx.advance(0.5)
    await flush()
    expect(outcome.value).toBe('ended')
  })
})
