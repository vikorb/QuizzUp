import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ANNOUNCER_DUCK_FACTOR,
  ANNOUNCER_DUCK_IN_MS,
  ANNOUNCER_DUCK_OUT_MS,
  ANNOUNCER_MANIFEST_URL,
  AnnouncerPlayer,
  WebAudioExtractPlayer,
  type AnnouncerPlayerOptions,
} from '../src/index'
import { FakeAudioContext, audioResponse, flush, tableFetch } from './fakeAudioContext'

/** Les valeurs du manifeste sont ignorées : seules les clés (identifiants) comptent. */
const MANIFEST = {
  version: 3,
  fr: { 'game.start': {}, 'round.1': {}, 'round.2': {}, 'round.3': {}, 'round.4': {} },
  en: { 'game.start': {}, 'round.1': {} },
}
/** Page courante de l'écran de salle : les clips sont résolus contre elle, comme `fetch`. */
const BASE_URI = 'http://salle.test/setup/lights'
const clip = (lang: string, id: string, version = '?v=3') =>
  `http://salle.test/announcer/${lang}/${id}.mp3${version}`
/** Durées (s) des faux fichiers : 'game.start' dure 2 s, les autres 1 s. */
const DURATIONS: Record<string, number> = { 'game.start': 2 }

let ctx: FakeAudioContext
let ducks: [number, number][]

/** Fetch du pack : manifeste en JSON, clips décrits par `tableFetch`. */
function packFetch(table: Parameters<typeof tableFetch>[0], manifest: unknown = MANIFEST) {
  const files = tableFetch(table)
  const calls: string[] = []
  const fetch = async (url: string): Promise<Response> => {
    calls.push(url)
    if (url !== ANNOUNCER_MANIFEST_URL) return files.fetch(url)
    return typeof manifest === 'string'
      ? new Response(manifest)
      : new Response(JSON.stringify(manifest))
  }
  return { fetch, calls }
}

function fullTable(lang = 'fr', version = '?v=3') {
  const ids = Object.keys(MANIFEST.fr)
  return Object.fromEntries(ids.map((id) => [clip(lang, id, version), DURATIONS[id] ?? 1]))
}

function createPlayer(
  fetch: AnnouncerPlayerOptions['fetch'],
  options: Partial<AnnouncerPlayerOptions> = {}
) {
  return new AnnouncerPlayer({
    context: () => ctx.asAudioContext(),
    fetch,
    duck: (factor, rampMs) => ducks.push([factor, rampMs]),
    ...options,
  })
}

async function readyPlayer(options: Partial<AnnouncerPlayerOptions> = {}) {
  const player = createPlayer(packFetch(fullTable()).fetch, options)
  await player.preload('fr')
  return player
}

/** Gain général des annonces : celui qui est branché sur la sortie du contexte. */
function announcerMaster() {
  return ctx.gains.find((gain) => gain.connections[0] === ctx.destination)
}

const DUCK_IN: [number, number] = [ANNOUNCER_DUCK_FACTOR, ANNOUNCER_DUCK_IN_MS]
const DUCK_OUT: [number, number] = [1, ANNOUNCER_DUCK_OUT_MS]

beforeEach(() => {
  ctx = new FakeAudioContext()
  ctx.state = 'running'
  ducks = []
  vi.stubGlobal('document', { baseURI: BASE_URI })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('preload', () => {
  it('lit le manifeste puis décode les clips de la langue, avec ?v=version', async () => {
    const pack = packFetch(fullTable())
    const player = createPlayer(pack.fetch)

    const result = await player.preload('fr')

    expect(result).toEqual({ loaded: Object.keys(MANIFEST.fr), failed: [] })
    expect(pack.calls[0]).toBe(ANNOUNCER_MANIFEST_URL)
    expect(pack.calls.slice(1).sort()).toEqual(
      Object.keys(MANIFEST.fr)
        .map((id) => clip('fr', id))
        .sort()
    )
    expect(player.has('round.2')).toBe(true)
    expect(player.has('round.9')).toBe(false)
  })

  it('cherche les clips à côté d’un manifeste à URL personnalisée', async () => {
    const calls: string[] = []
    const fetch = async (url: string): Promise<Response> => {
      calls.push(url)
      if (url.endsWith('manifest.json')) return new Response('{"version":1,"fr":{"a":{}}}')
      return audioResponse(1)
    }

    const result = await createPlayer(fetch, { manifestUrl: '/pack/x/manifest.json' }).preload('fr')

    expect(result).toEqual({ loaded: ['a'], failed: [] })
    expect(calls).toEqual(['/pack/x/manifest.json', 'http://salle.test/pack/x/fr/a.mp3?v=1'])
  })

  it('un manifeste à URL relative est résolu contre la page, comme le fait fetch', async () => {
    const calls: string[] = []
    const fetch = async (url: string): Promise<Response> => {
      calls.push(url)
      if (url.endsWith('manifest.json')) return new Response('{"version":1,"fr":{"a":{}}}')
      return audioResponse(1)
    }

    await createPlayer(fetch, { manifestUrl: 'announcer/manifest.json' }).preload('fr')

    expect(calls).toEqual([
      'announcer/manifest.json',
      'http://salle.test/setup/announcer/fr/a.mp3?v=1',
    ])
  })

  it('une « / » dans la requête du manifeste ne décale pas le dossier des clips', async () => {
    const manifestUrl = '/pack/manifest.json?token=a/b'
    const calls: string[] = []
    const fetch = async (url: string): Promise<Response> => {
      calls.push(url)
      if (url === manifestUrl) return new Response('{"version":1,"fr":{"a":{}}}')
      return audioResponse(1)
    }

    await createPlayer(fetch, { manifestUrl }).preload('fr')

    expect(calls[1]).toBe('http://salle.test/pack/fr/a.mp3?v=1')
  })

  it('sans version dans le manifeste, aucun paramètre ?v=', async () => {
    const pack = packFetch({ 'http://salle.test/announcer/fr/a.mp3': 1 }, { fr: { a: {} } })

    const result = await createPlayer(pack.fetch).preload('fr')

    expect(result).toEqual({ loaded: ['a'], failed: [] })
    expect(pack.calls).toEqual([ANNOUNCER_MANIFEST_URL, 'http://salle.test/announcer/fr/a.mp3'])
  })

  it('une langue absente du manifeste ne charge rien', async () => {
    const pack = packFetch(fullTable())

    const result = await createPlayer(pack.fetch).preload('de')

    expect(result).toEqual({ loaded: [], failed: [] })
    expect(pack.calls).toEqual([ANNOUNCER_MANIFEST_URL])
  })

  it('un clip absent, corrompu ou injoignable est listé en échec et reste muet', async () => {
    const table = {
      ...fullTable(),
      [clip('fr', 'round.1')]: 404 as const,
      [clip('fr', 'round.2')]: 'corrupt' as const,
      [clip('fr', 'round.3')]: 'network' as const,
    }
    const player = createPlayer(packFetch(table).fetch)

    const result = await player.preload('fr')

    expect(result.loaded).toEqual(['game.start', 'round.4'])
    expect(result.failed).toEqual(['round.1', 'round.2', 'round.3'])
    player.say('round.1')
    player.say('round.2')
    expect(ctx.sources).toHaveLength(0)
    expect(ducks).toEqual([])
    player.say('round.4')
    expect(ctx.startedSources()).toHaveLength(1)
  })

  it.each([
    ['manifeste introuvable (404)', () => Promise.resolve(new Response('', { status: 404 }))],
    ['manifeste injoignable', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['manifeste qui n’est pas du JSON (page HTML)', () => Promise.resolve(new Response('<html>'))],
    ['manifeste qui n’est pas un objet', () => Promise.resolve(new Response('[1, 2]'))],
    ['langue mal formée dans le manifeste', () => Promise.resolve(new Response('{"fr": 12}'))],
  ])('%s : résout sans erreur, sans voix', async (_label, respond) => {
    const player = createPlayer(respond)

    await expect(player.preload('fr')).resolves.toEqual({ loaded: [], failed: [] })

    player.say('round.1')
    expect(ctx.sources).toHaveLength(0)
  })

  it('ne rejette pas si le contexte audio ne peut pas être créé', async () => {
    const pack = packFetch(fullTable())
    const player = createPlayer(pack.fetch, {
      context: () => {
        throw new Error('pas de Web Audio')
      },
    })

    const result = await player.preload('fr')

    expect(result.loaded).toEqual([])
    expect(result.failed).toEqual(Object.keys(MANIFEST.fr))
    expect(() => player.say('round.1')).not.toThrow()
  })

  it('un nouveau preload (autre langue) remplace les clips et l’ancien en vol est ignoré', async () => {
    const table = { ...fullTable('fr'), ...fullTable('en') }
    const pack = packFetch(table)
    let releaseFirst: () => void = () => undefined
    let manifestCalls = 0
    const player = createPlayer(async (url) => {
      if (url === ANNOUNCER_MANIFEST_URL && manifestCalls++ === 0) {
        await new Promise<void>((resolve) => (releaseFirst = resolve))
      }
      return pack.fetch(url)
    })

    const first = player.preload('fr')
    await flush()
    await player.preload('en')
    releaseFirst()
    const superseded = await first

    // Rien n'est conservé de ce preload : il ne doit pas annoncer des clips « chargés ».
    expect(superseded).toEqual({ loaded: [], failed: Object.keys(MANIFEST.fr) })

    expect(player.has('game.start')).toBe(true)
    expect(player.has('round.1')).toBe(true)
    expect(player.has('round.4')).toBe(false) // clip fr uniquement : le preload fr est périmé
  })
})

describe('say : lecture et atténuation', () => {
  it('joue le clip, atténue les extraits pendant l’annonce puis les rétablit', async () => {
    const player = await readyPlayer({ volume: 0.7 })
    ctx.currentTime = 4

    player.say('game.start')

    const source = ctx.lastSource()
    expect(source.startCall).toEqual({ when: 4, offset: 0, duration: undefined })
    expect(ducks).toEqual([DUCK_IN])
    const master = announcerMaster()
    expect(master?.gain.value).toBe(0.7)
    const [speechGain] = source.connections
    expect(ctx.gains).toContain(speechGain)
    expect((speechGain as { connections: unknown[] }).connections).toEqual([master])

    ctx.advance(1.999)
    expect(ducks).toEqual([DUCK_IN])
    ctx.advance(0.001)
    expect(ducks).toEqual([DUCK_IN, DUCK_OUT])
    expect(source.disconnectCount).toBe(1)
  })

  it('un clip inconnu ou non chargé ne fait rien : ni son, ni atténuation', async () => {
    const player = await readyPlayer()

    player.say('round.99')
    player.say('')

    expect(ctx.sources).toHaveLength(0)
    expect(ducks).toEqual([])
  })

  it('ne joue rien sur un contexte suspendu ou fermé, sans erreur ni resume()', async () => {
    const player = await readyPlayer()
    for (const state of ['suspended', 'closed'] as const) {
      ctx.state = state

      expect(() => player.say('round.1')).not.toThrow()
    }

    expect(ctx.sources).toHaveLength(0)
    expect(ctx.resumeCalls).toBe(0)
    expect(ducks).toEqual([])
  })

  it('un contexte qui se fige en pleine annonce : le say suivant remet tout à zéro', async () => {
    const player = await readyPlayer()
    player.say('game.start')
    player.say('round.1')
    ctx.state = 'suspended'

    player.say('round.2')

    expect(ducks).toEqual([DUCK_IN, DUCK_OUT])
    ctx.state = 'running'
    ctx.advance(10)
    // L'annonce en attente n'est pas ressortie en retard.
    expect(ctx.startedSources()).toHaveLength(1)
  })

  it('ne lève jamais d’erreur si le contexte devient inutilisable', async () => {
    const player = await readyPlayer()
    vi.spyOn(ctx, 'createBufferSource').mockImplementation(() => {
      throw new Error('InvalidStateError')
    })

    expect(() => player.say('round.1')).not.toThrow()
    expect(() => player.say('round.2')).not.toThrow()
  })

  it('volume : borné entre 0 et 1, appliqué au gain des annonces', async () => {
    const player = await readyPlayer({ volume: 0.5 })
    player.say('round.1')
    const master = announcerMaster()
    expect(master?.gain.value).toBe(0.5)

    player.setVolume(3)
    expect(master?.gain.value).toBe(1)
    player.setVolume(Number.NaN)
    expect(master?.gain.value).toBe(1)
    player.setVolume(0.2)
    expect(master?.gain.value).toBe(0.2)
  })
})

describe('say : file d’attente', () => {
  it('joue les annonces dans l’ordre, sans coupure, atténuation maintenue entre deux', async () => {
    const player = await readyPlayer()

    player.say('round.1')
    player.say('round.2')
    player.say('round.3')

    expect(ctx.startedSources()).toHaveLength(1)
    ctx.advance(1)
    expect(ctx.startedSources()).toHaveLength(2)
    expect(ctx.sources[1]?.startCall?.when).toBe(1)
    ctx.advance(1)
    expect(ctx.startedSources()).toHaveLength(3)
    expect(ducks).toEqual([DUCK_IN])
    ctx.advance(1)
    expect(ducks).toEqual([DUCK_IN, DUCK_OUT])
    expect(ctx.startedSources()).toHaveLength(3)
  })

  it('ignore un doublon, en cours comme en attente', async () => {
    const player = await readyPlayer()

    player.say('round.1')
    player.say('round.1')
    player.say('round.2')
    player.say('round.2')
    ctx.advance(1)
    ctx.advance(1)

    expect(ctx.startedSources()).toHaveLength(2)
  })

  it('une annonce déjà dite peut être redite une fois terminée', async () => {
    const player = await readyPlayer()
    player.say('round.1')
    ctx.advance(1)

    player.say('round.1')

    expect(ctx.startedSources()).toHaveLength(2)
  })

  it('la file est bornée : au-delà de 2 en attente, la plus ancienne est abandonnée', async () => {
    const player = await readyPlayer()

    player.say('round.1') // en cours
    player.say('round.2') // abandonnée
    player.say('round.3')
    player.say('round.4')
    ctx.advance(1)
    ctx.advance(1)
    ctx.advance(1)

    expect(ctx.startedSources()).toHaveLength(3)
    const order = ctx.startedSources().map((source) => source.startCall?.when)
    expect(order).toEqual([0, 1, 2])
  })

  it('une annonce périmée n’est jamais jouée en retard', async () => {
    const player = await readyPlayer()

    player.say('game.start') // 2 s
    player.say('round.1', { maxWaitMs: 1500 }) // périmée à 1,5 s
    player.say('round.2', { maxWaitMs: 2000 }) // juste à l'heure : attend exactement 2 s
    ctx.advance(2)

    expect(ctx.startedSources()).toHaveLength(2)
    expect(ctx.sources[1]?.startCall?.when).toBe(2)
    ctx.advance(1)
    expect(ducks).toEqual([DUCK_IN, DUCK_OUT])
  })

  it('attente maximale par défaut de 4 s : encore jouée à 3,9 s', async () => {
    const player = await readyPlayer()
    ctx.currentTime = 10
    player.say('game.start')
    player.say('round.1')

    ctx.advance(3.9) // la fin du clip en cours est constatée 3,9 s après la mise en file

    expect(ctx.startedSources()).toHaveLength(2)
  })

  it('attente maximale par défaut de 4 s : périmée si l’horloge dépasse 4 s avant la fin du clip en cours', async () => {
    const player = await readyPlayer()
    ctx.currentTime = 10
    player.say('game.start')
    player.say('round.1')

    ctx.advance(4.1)

    expect(ctx.startedSources()).toHaveLength(1)
    expect(ducks).toEqual([DUCK_IN, DUCK_OUT])
  })

  it('attente maximale négative : jouée tout de suite quand la file est vide', async () => {
    const player = await readyPlayer()

    player.say('round.1', { maxWaitMs: -500 })

    expect(ctx.startedSources()).toHaveLength(1)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    'attente maximale %s : remplacée par la valeur par défaut (4 s)',
    async (maxWaitMs) => {
      const player = await readyPlayer()
      player.say('game.start')
      player.say('round.1', { maxWaitMs })

      ctx.advance(4.1)

      expect(ctx.startedSources()).toHaveLength(1)
    }
  )

  it('une priorité plus haute coupe l’annonce en cours et vide la file', async () => {
    const player = await readyPlayer()
    player.say('game.start')
    player.say('round.1')
    ctx.advance(0.5)

    player.say('round.2', { priority: 1 })

    const [first, second] = ctx.sources
    expect(first?.stopTime).toBeCloseTo(0.52)
    expect(ctx.startedSources()).toHaveLength(2)
    expect(second?.startCall?.when).toBe(0.5)
    expect(ducks).toEqual([DUCK_IN])

    ctx.advance(10)
    // Ni la coupée, ni celle de la file ne ressortent.
    expect(ctx.startedSources()).toHaveLength(2)
    expect(ducks).toEqual([DUCK_IN, DUCK_OUT])
  })

  it('une priorité égale ou plus basse attend son tour', async () => {
    const player = await readyPlayer()
    player.say('game.start', { priority: 2 })

    player.say('round.1', { priority: 2 })
    player.say('round.2', { priority: 1 })

    expect(ctx.startedSources()).toHaveLength(1)
    expect(ctx.sources[0]?.stopTime).toBeNull()
  })

  it('stop() coupe l’annonce, vide la file et rétablit les extraits', async () => {
    const player = await readyPlayer()
    player.say('game.start')
    player.say('round.1')

    player.stop()
    ctx.advance(10)

    expect(ctx.sources[0]?.stopTime).toBeCloseTo(0.02)
    expect(ctx.startedSources()).toHaveLength(1)
    expect(ducks).toEqual([DUCK_IN, DUCK_OUT])
    expect(() => player.stop()).not.toThrow()
  })
})

describe('say : priorité dans la file', () => {
  /** Clips de durées distinctes : on reconnaît l'annonce jouée par la durée de son buffer. */
  const LENGTHS: Record<string, number> = {
    'game.start': 2,
    'round.1': 1.1,
    'round.2': 1.2,
    'round.3': 1.3,
  }
  async function distinctPlayer() {
    const table = Object.fromEntries(
      Object.entries(LENGTHS).map(([id, seconds]) => [clip('fr', id), seconds])
    )
    const player = createPlayer(packFetch(table).fetch)
    await player.preload('fr')
    return player
  }
  const played = () =>
    ctx
      .startedSources()
      .map((source) => Object.entries(LENGTHS).find(([, s]) => s === source.buffer?.duration)?.[0])

  it('la file sort par priorité décroissante, puis par ordre d’arrivée', async () => {
    const player = await distinctPlayer()

    player.say('game.start', { priority: 2 })
    player.say('round.1')
    player.say('round.2', { priority: 1 })
    ctx.advance(2)
    ctx.advance(1.2)
    ctx.advance(1.1)

    expect(played()).toEqual(['game.start', 'round.2', 'round.1'])
  })

  it('file pleine : l’arrivante plus prioritaire évince la plus ancienne de plus basse priorité', async () => {
    const player = await distinctPlayer()
    player.say('game.start', { priority: 2 })
    player.say('round.1') // la plus ancienne de priorité 0 : évincée
    player.say('round.2')

    player.say('round.3', { priority: 1 })
    ctx.advance(2)
    ctx.advance(1.3)
    ctx.advance(1.2)

    expect(played()).toEqual(['game.start', 'round.3', 'round.2'])
  })

  it('file pleine : l’arrivante de plus basse priorité est refusée, la file reste intacte', async () => {
    const player = await distinctPlayer()
    player.say('game.start', { priority: 2 })
    player.say('round.1', { priority: 1 })
    player.say('round.2', { priority: 1 })

    player.say('round.3') // priorité 0 : la plus basse, refusée
    ctx.advance(2)
    ctx.advance(1.1)
    ctx.advance(1.2)

    expect(played()).toEqual(['game.start', 'round.1', 'round.2'])
  })

  it('un doublon en attente repris avec une priorité plus haute remplace l’ancien et coupe l’annonce en cours', async () => {
    const player = await distinctPlayer()
    player.say('game.start')
    player.say('round.1') // en attente, priorité 0

    player.say('round.1', { priority: 1 })

    expect(ctx.sources[0]?.stopTime).toBeCloseTo(0.02)
    expect(played()).toEqual(['game.start', 'round.1'])
    ctx.advance(10)
    expect(played()).toEqual(['game.start', 'round.1']) // l'ancienne entrée n'est pas ressortie
  })

  it('une annonce en cours sur un contexte remplacé est considérée terminée', async () => {
    const replacement = new FakeAudioContext()
    replacement.state = 'running'
    let active = ctx
    const player = createPlayer(packFetch(fullTable()).fetch, {
      context: () => active.asAudioContext(),
    })
    await player.preload('fr')
    player.say('game.start') // jamais de `onended` : son contexte est remplacé
    active = replacement

    player.say('round.1')

    expect(replacement.startedSources()).toHaveLength(1)
    replacement.advance(1)
    expect(ducks).toEqual([DUCK_IN, DUCK_OUT])
  })
})

describe('say : échecs', () => {
  it('un clip qui ne peut pas démarrer rétablit les extraits et laisse la suite possible', async () => {
    const player = await readyPlayer()
    vi.spyOn(ctx, 'createBufferSource').mockImplementationOnce(() => {
      throw new Error('InvalidStateError')
    })

    expect(() => player.say('round.1')).not.toThrow()

    expect(ducks).toEqual([DUCK_IN, DUCK_OUT])
    expect(ctx.sources).toHaveLength(0)
    player.say('round.1')
    expect(ctx.startedSources()).toHaveLength(1)
  })

  it('un clip en échec au milieu de la file n’empêche pas les suivants', async () => {
    const player = await readyPlayer()
    player.say('round.1')
    player.say('round.2') // échouera
    player.say('round.3')
    vi.spyOn(ctx, 'createBufferSource').mockImplementationOnce(() => {
      throw new Error('InvalidStateError')
    })

    ctx.advance(1)

    expect(ctx.startedSources()).toHaveLength(2)
    expect(ctx.lastSource().startCall?.when).toBe(1)
    ctx.advance(1)
    expect(ducks).toEqual([DUCK_IN, DUCK_OUT])
  })

  it('une atténuation qui échoue n’empêche pas l’annonce', async () => {
    const player = await readyPlayer({
      duck: () => {
        throw new Error('duck cassé')
      },
    })

    expect(() => player.say('round.1')).not.toThrow()

    expect(ctx.startedSources()).toHaveLength(1)
    expect(() => ctx.advance(1)).not.toThrow()
  })

  it('fonctionne sans fonction d’atténuation', async () => {
    const player = createPlayer(packFetch(fullTable()).fetch, { duck: undefined })
    await player.preload('fr')

    player.say('round.1')

    expect(ctx.startedSources()).toHaveLength(1)
  })
})

describe('sharing : avec le lecteur d’extraits', () => {
  it('partage le contexte et baisse puis remonte le gain des extraits', async () => {
    const extracts = new WebAudioExtractPlayer({
      createContext: () => ctx.asAudioContext(),
      fetch: tableFetch({ '/song': 60 }).fetch,
      volume: 0.8,
    })
    await extracts.unlock()
    await extracts.preload(['/song'])
    void extracts.play('/song', 0, 20000)
    const extractMaster = ctx.gains[0]
    const pack = packFetch(fullTable())
    const announcer = AnnouncerPlayer.sharing(extracts, { fetch: pack.fetch })
    await announcer.preload('fr')
    ctx.currentTime = 3

    announcer.say('round.1')

    expect(ctx.startedSources()).toHaveLength(2) // l'extrait et l'annonce, un seul contexte
    expect(extractMaster?.gain.events.at(-1)).toMatchObject({
      type: 'linear',
      value: expect.closeTo(0.8 * ANNOUNCER_DUCK_FACTOR, 10),
      time: 3 + ANNOUNCER_DUCK_IN_MS / 1000,
    })

    ctx.advance(1)

    expect(extractMaster?.gain.events.at(-1)).toMatchObject({
      type: 'linear',
      value: 0.8,
      time: 4 + ANNOUNCER_DUCK_OUT_MS / 1000,
    })
    expect(extracts.getVolume()).toBe(0.8)
  })
})
