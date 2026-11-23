import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EXTRACT_EFFECTS,
  SLOWED_PLAYBACK_RATE,
  WebAudioExtractPlayer,
  type ExtractEffect,
} from '../src/index'
import { FakeAudioContext, flush, tableFetch, track } from './fakeAudioContext'

const SONG = '/questions/1/media'
const SHORT = '/questions/2/media'

let ctx: FakeAudioContext
let files: ReturnType<typeof tableFetch>

async function loadedPlayer(options: { volume?: number } = {}) {
  const player = new WebAudioExtractPlayer({
    createContext: () => ctx.asAudioContext(),
    fetch: files.fetch,
    ...options,
  })
  await player.unlock()
  await player.preload([SONG, SHORT])
  return player
}

/** Échantillons du buffer créé en dernier (fenêtre inversée). */
function lastCreated(channel = 0): Float32Array {
  const buffer = ctx.createdBuffers.at(-1)
  if (!buffer) throw new Error('aucun buffer créé')
  return buffer.getChannelData(channel)
}

beforeEach(() => {
  ctx = new FakeAudioContext()
  files = tableFetch({ [SONG]: 180, [SHORT]: 4 })
})

describe('constantes', () => {
  it('liste les effets et fixe la vitesse du ralenti', () => {
    expect(EXTRACT_EFFECTS).toEqual(['none', 'short', 'reverse', 'slowed'])
    expect(SLOWED_PLAYBACK_RATE).toBe(0.75)
  })
})

describe('appels sans effet (compatibilité)', () => {
  it.each<[string, { effect?: ExtractEffect } | undefined]>([
    ['sans options', undefined],
    ['options vides', {}],
    ['effet none', { effect: 'none' }],
    ['effet short (affaire du moteur)', { effect: 'short' }],
  ])('%s : même planification, aucune vitesse ni copie de buffer', async (_label, options) => {
    const player = await loadedPlayer()
    ctx.currentTime = 2

    const outcome = track(player.play(SONG, 42, 5000, options))

    const source = ctx.lastSource()
    expect(source.startCall).toEqual({ when: 2, offset: 42, duration: 5 })
    expect(source.playbackRate.events).toEqual([])
    expect(source.playbackRate.value).toBe(1)
    expect(ctx.createdBuffers).toHaveLength(0)
    ctx.advance(5)
    await flush()
    expect(outcome.value).toBe('ended')
  })

  it('un effet inconnu (appelant non typé) joue comme none', async () => {
    const player = await loadedPlayer()

    void player.play(SONG, 42, 5000, { effect: 'bogus' as ExtractEffect })

    expect(ctx.lastSource().startCall).toEqual({ when: 0, offset: 42, duration: 5 })
    expect(ctx.createdBuffers).toHaveLength(0)
  })

  it('un effet ne télécharge rien de plus', async () => {
    const player = await loadedPlayer()
    const before = [...files.calls]

    void player.play(SONG, 30, 1000, { effect: 'reverse' })
    void player.play(SONG, 30, 1000, { effect: 'slowed' })

    expect(files.calls).toEqual(before)
  })
})

describe('effet slowed', () => {
  it('lit à 0,75 : durée du fichier = temps réel × 0,75, fin en temps réel', async () => {
    const player = await loadedPlayer()
    ctx.currentTime = 1

    const outcome = track(player.play(SONG, 30, 4000, { effect: 'slowed' }))

    const source = ctx.lastSource()
    expect(source.playbackRate.value).toBe(SLOWED_PLAYBACK_RATE)
    expect(source.startCall).toEqual({ when: 1, offset: 30, duration: 3 })
    ctx.advance(3.999)
    await flush()
    expect(outcome.settled).toBe(false)
    ctx.advance(0.001)
    await flush()
    expect(outcome.value).toBe('ended')
  })

  it('cale le fondu sur la durée réelle, pas sur celle du fichier', async () => {
    const player = await loadedPlayer()
    ctx.currentTime = 1

    void player.play(SONG, 30, 4000, { effect: 'slowed' })

    const events = ctx.gains.at(-1)?.gain.events
    expect(events?.at(-1)).toEqual({ type: 'linear', value: 0, time: 5 })
  })

  it('s’arrête à la fin du fichier, calculée en temps réel (plus tard qu’à vitesse normale)', async () => {
    const player = await loadedPlayer()

    const outcome = track(player.play(SHORT, 2, 5000, { effect: 'slowed' }))

    // Il reste 2 s de fichier, jouées à 0,75 : 2 / 0,75 = 2,667 s d'horloge.
    expect(ctx.lastSource().startCall?.duration).toBeCloseTo(2, 9)
    ctx.advance(2.6)
    await flush()
    expect(outcome.settled).toBe(false)
    ctx.advance(0.1)
    await flush()
    expect(outcome.value).toBe('ended')
  })
})

describe('effet reverse', () => {
  it('lit la fenêtre du palier à l’envers, depuis sa fin', async () => {
    const player = await loadedPlayer()

    const outcome = track(player.play(SONG, 10, 2000, { effect: 'reverse' }))

    const source = ctx.lastSource()
    expect(ctx.createdBuffers).toHaveLength(1)
    expect(source.buffer).toBe(ctx.createdBuffers[0])
    expect(source.startCall).toEqual({ when: 0, offset: 0, duration: 2 })
    expect(source.playbackRate.value).toBe(1)
    // Rampe d'origine : index 10000..11999 dans le fichier, lue de 11999 à 10000.
    const left = lastCreated(0)
    expect(left).toHaveLength(2000)
    expect(left[0]).toBe(11999)
    expect(left[1]).toBe(11998)
    expect(left[1999]).toBe(10000)
    expect(lastCreated(1)[0]).toBe(1_011_999)
    ctx.advance(2)
    await flush()
    expect(outcome.value).toBe('ended')
  })

  it('ne modifie pas le buffer d’origine : deux lectures donnent la même fenêtre inversée', async () => {
    const player = await loadedPlayer()

    void player.play(SONG, 10, 1000, { effect: 'reverse' })
    const first = Array.from(lastCreated())
    void player.play(SONG, 10, 1000, { effect: 'reverse' })

    expect(Array.from(lastCreated())).toEqual(first)
    expect(first[0]).toBe(10999)
  })

  it('chaque palier inverse sa propre fenêtre', async () => {
    const player = await loadedPlayer()

    void player.play(SONG, 30, 1000, { effect: 'reverse' })
    expect(lastCreated()).toHaveLength(1000)
    expect(lastCreated()[0]).toBe(30999)

    void player.play(SONG, 30, 5000, { effect: 'reverse' })
    expect(lastCreated()).toHaveLength(5000)
    expect(lastCreated()[0]).toBe(34999)
  })

  it('borne la fenêtre à la fin du fichier', async () => {
    const player = await loadedPlayer()

    const outcome = track(player.play(SHORT, 3, 5000, { effect: 'reverse' }))

    expect(lastCreated()).toHaveLength(1000)
    expect(lastCreated()[0]).toBe(3999)
    expect(ctx.lastSource().startCall).toEqual({ when: 0, offset: 0, duration: 1 })
    ctx.advance(1)
    await flush()
    expect(outcome.value).toBe('ended')
  })

  it('se résout « ended » tout de suite sans rien copier si le départ dépasse le fichier', async () => {
    const player = await loadedPlayer()

    await expect(player.play(SHORT, 10, 5000, { effect: 'reverse' })).resolves.toBe('ended')

    expect(ctx.createdBuffers).toHaveLength(0)
    expect(ctx.sources).toHaveLength(0)
  })

  it('une fenêtre de moins d’un échantillon se résout « ended » sans créer de buffer', async () => {
    const player = await loadedPlayer()

    // Reste 0,4 ms de fichier (0,4 échantillon à 1 kHz) : la fenêtre arrondie est vide.
    await expect(player.play(SHORT, 3.9996, 5000, { effect: 'reverse' })).resolves.toBe('ended')

    expect(ctx.createdBuffers).toHaveLength(0)
    expect(ctx.sources).toHaveLength(0)
  })

  it('un chargement à la volée qui échoue à la création du buffer rejette et libère le lecteur', async () => {
    const player = new WebAudioExtractPlayer({
      createContext: () => ctx.asAudioContext(),
      fetch: files.fetch,
    })
    await player.unlock()
    vi.spyOn(ctx, 'createBuffer').mockImplementationOnce(() => {
      throw new Error('NotSupportedError')
    })

    const outcome = track(player.play(SONG, 10, 1000, { effect: 'reverse' }))
    await flush()

    expect(outcome.settled).toBe(true)
    expect(outcome.error).toBeInstanceOf(Error)
    const next = track(player.play(SONG, 10, 1000, { effect: 'reverse' }))
    await flush()
    ctx.advance(1)
    await flush()
    expect(next.value).toBe('ended')
  })

  it('un buffer préchargé qui échoue à la création rejette', async () => {
    const player = await loadedPlayer()
    vi.spyOn(ctx, 'createBuffer').mockImplementationOnce(() => {
      throw new Error('NotSupportedError')
    })

    await expect(player.play(SONG, 10, 1000, { effect: 'reverse' })).rejects.toThrow(
      'NotSupportedError'
    )
  })

  it('fonctionne aussi sur un chargement à la volée', async () => {
    const player = new WebAudioExtractPlayer({
      createContext: () => ctx.asAudioContext(),
      fetch: files.fetch,
    })
    await player.unlock()

    const outcome = track(player.play(SONG, 10, 1000, { effect: 'reverse' }))
    await flush()

    expect(lastCreated()[0]).toBe(10999)
    ctx.advance(1)
    await flush()
    expect(outcome.value).toBe('ended')
  })
})

describe('pause et reprise avec chaque effet', () => {
  it.each(EXTRACT_EFFECTS)(
    '%s : pause en temps réel, reprise pour le temps restant, fin exacte',
    async (effect) => {
      const player = await loadedPlayer()
      const outcome = track(player.play(SONG, 30, 4000, { effect }))
      ctx.advance(1)

      expect(player.pause()).toBe(1000)
      ctx.advance(5)
      await flush()
      expect(outcome.settled).toBe(false)

      player.resume()
      ctx.advance(2.999)
      await flush()
      expect(outcome.settled).toBe(false)
      ctx.advance(0.001)
      await flush()
      expect(outcome.value).toBe('ended')
    }
  )

  it('slowed : la reprise repart à la position du fichier (temps écoulé × 0,75)', async () => {
    const player = await loadedPlayer()
    void player.play(SONG, 30, 6000, { effect: 'slowed' })
    ctx.advance(2)
    expect(player.pause()).toBe(2000)
    ctx.advance(3)

    player.resume()

    const resumed = ctx.lastSource()
    expect(resumed.playbackRate.value).toBe(SLOWED_PLAYBACK_RATE)
    expect(resumed.startCall).toEqual({ when: 5, offset: 31.5, duration: 3 })
  })

  it('slowed : cumule plusieurs pauses sans dériver', async () => {
    const player = await loadedPlayer()
    void player.play(SONG, 0, 8000, { effect: 'slowed' })
    ctx.advance(2)
    expect(player.pause()).toBe(2000)
    player.resume()
    ctx.advance(2)
    expect(player.pause()).toBe(4000)
    player.resume()

    expect(ctx.lastSource().startCall).toEqual({ when: 4, offset: 3, duration: 3 })
  })

  it('reverse : la reprise réutilise la fenêtre inversée, lue à partir du temps écoulé', async () => {
    const player = await loadedPlayer()
    void player.play(SONG, 10, 4000, { effect: 'reverse' })
    const reversed = ctx.lastSource().buffer
    ctx.advance(1.5)
    expect(player.pause()).toBe(1500)
    ctx.advance(2)

    player.resume()

    const resumed = ctx.lastSource()
    expect(resumed.buffer).toBe(reversed)
    expect(ctx.createdBuffers).toHaveLength(1)
    expect(resumed.startCall).toEqual({ when: 3.5, offset: 1.5, duration: 2.5 })
  })

  it('slowed : une pause après l’échéance réelle mais avant onended termine le palier', async () => {
    const player = await loadedPlayer()
    const outcome = track(player.play(SONG, 0, 1000, { effect: 'slowed' }))
    ctx.currentTime = 1.2

    expect(player.pause()).toBe(1000)
    await flush()

    expect(outcome.value).toBe('ended')
  })

  it('stop() résout « stopped » avec chaque effet', async () => {
    for (const effect of EXTRACT_EFFECTS) {
      const player = await loadedPlayer()
      const outcome = track(player.play(SONG, 0, 4000, { effect }))
      ctx.advance(1)

      player.stop()
      await flush()

      expect(outcome.value).toBe('stopped')
    }
  })
})

describe('elapsedMs (reprise après rechargement)', () => {
  it('none : repart à startSec + temps écoulé, pour le temps restant', async () => {
    const player = await loadedPlayer()

    const outcome = track(player.play(SONG, 30, 5000, { elapsedMs: 2000 }))

    expect(ctx.lastSource().startCall).toEqual({ when: 0, offset: 32, duration: 3 })
    ctx.advance(3)
    await flush()
    expect(outcome.value).toBe('ended')
  })

  it('slowed : la position du fichier avance moins vite que le temps écoulé', async () => {
    const player = await loadedPlayer()

    const outcome = track(player.play(SONG, 30, 5000, { effect: 'slowed', elapsedMs: 2000 }))

    expect(ctx.lastSource().startCall).toEqual({ when: 0, offset: 31.5, duration: 2.25 })
    ctx.advance(3)
    await flush()
    expect(outcome.value).toBe('ended')
  })

  it('reverse : lit la fenêtre complète du palier, à partir du temps écoulé', async () => {
    const player = await loadedPlayer()

    void player.play(SONG, 30, 5000, { effect: 'reverse', elapsedMs: 2000 })

    expect(lastCreated()).toHaveLength(5000)
    expect(ctx.lastSource().startCall).toEqual({ when: 0, offset: 2, duration: 3 })
  })

  it('pause() compte le temps déjà joué avant la reprise', async () => {
    const player = await loadedPlayer()
    void player.play(SONG, 30, 5000, { elapsedMs: 2000 })
    ctx.advance(1)

    expect(player.pause()).toBe(3000)
  })

  it('un temps écoulé égal ou supérieur au palier se résout « ended » sans rien jouer', async () => {
    const player = await loadedPlayer()

    await expect(player.play(SONG, 30, 5000, { elapsedMs: 5000 })).resolves.toBe('ended')
    await expect(player.play(SONG, 30, 5000, { elapsedMs: 9000 })).resolves.toBe('ended')

    expect(ctx.startedSources()).toHaveLength(0)
  })

  it.each([-100, Number.NaN, Number.NEGATIVE_INFINITY])(
    'un temps écoulé invalide (%s) vaut 0',
    async (elapsedMs) => {
      const player = await loadedPlayer()

      void player.play(SONG, 30, 5000, { elapsedMs })

      expect(ctx.lastSource().startCall).toEqual({ when: 0, offset: 30, duration: 5 })
    }
  )
})

describe('duck (atténuation pour les annonces)', () => {
  it('rampe le gain maître vers volume × facteur, puis revient au volume', async () => {
    const player = await loadedPlayer({ volume: 0.5 })
    void player.play(SONG, 0, 5000)
    const master = ctx.gains[0]
    ctx.currentTime = 2

    player.duck(0.3, 80)
    player.duck(1, 300)

    expect(master?.gain.events).toEqual([
      { type: 'cancel', value: 0, time: 2 },
      { type: 'set', value: 0.5, time: 2 },
      { type: 'linear', value: 0.15, time: 2.08 },
      { type: 'cancel', value: 0, time: 2 },
      { type: 'set', value: 0.5, time: 2 },
      { type: 'linear', value: 0.5, time: 2.3 },
    ])
    expect(player.getVolume()).toBe(0.5)
  })

  it('appliqué avant la première lecture : le gain maître naît atténué', async () => {
    const player = await loadedPlayer({ volume: 0.5 })

    player.duck(0.3, 80)
    void player.play(SONG, 0, 1000)

    expect(ctx.gains[0]?.gain.value).toBeCloseTo(0.15, 10)
  })

  it('ne crée pas de contexte audio s’il n’y en a pas encore', () => {
    const createContext = vi.fn(() => ctx.asAudioContext())
    const player = new WebAudioExtractPlayer({ createContext })

    player.duck(0.3, 80)

    expect(createContext).not.toHaveBeenCalled()
  })

  it('setVolume pendant la rampe d’atténuation annule la rampe et garde le facteur', async () => {
    const player = await loadedPlayer()
    void player.play(SONG, 0, 5000)
    player.duck(0.3, 80)
    ctx.currentTime = 0.04 // en pleine rampe d'entrée

    player.setVolume(0.5)

    const events = ctx.gains[0]?.gain.events
    expect(events?.slice(-2)).toEqual([
      { type: 'cancel', value: 0, time: 0.04 },
      { type: 'set', value: expect.closeTo(0.15, 10), time: 0.04 },
    ])
    expect(player.getVolume()).toBe(0.5)
  })

  it('setVolume pendant la rampe de retour annule la rampe vers l’ancien volume', async () => {
    const player = await loadedPlayer()
    void player.play(SONG, 0, 5000)
    player.duck(0.3, 80)
    player.duck(1, 300)
    ctx.currentTime = 0.1

    player.setVolume(0.5)

    expect(ctx.gains[0]?.gain.events.slice(-2)).toEqual([
      { type: 'cancel', value: 0, time: 0.1 },
      { type: 'set', value: 0.5, time: 0.1 },
    ])
  })

  it('borne le facteur, ignore NaN et une rampe invalide', async () => {
    const player = await loadedPlayer()
    void player.play(SONG, 0, 5000)
    const master = ctx.gains[0]

    player.duck(4, 80)
    expect(master?.gain.events.at(-1)).toMatchObject({ type: 'linear', value: 1 })
    player.duck(0.4, 80)
    player.duck(Number.NaN, Number.NaN)

    expect(master?.gain.events.at(-1)).toMatchObject({ type: 'linear', value: 0.4, time: 0 })
  })
})
