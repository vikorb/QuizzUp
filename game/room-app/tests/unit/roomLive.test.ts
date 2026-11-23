import { LIVE_HEARTBEAT_MS, LIVE_STATUS_EVERY_MS } from '@quizzup/shared'
import { nextTick, ref } from 'vue'

import { createSilentExtractPlayer } from '@/audio/player'
import { rememberBackofficeGameId } from '@/game/backofficeGameMemory'
import { createMemorySessionStorage } from '@/game/session'
import {
  closeGame,
  configureRoomGame,
  pauseGame,
  startNewGame,
  useRoomGame,
} from '@/game/useRoomGame'
import {
  MIN_PUBLISH_GAP_MS,
  RECONNECT_DELAYS_MS,
  startRoomLive,
  STATUS_TIMEOUT_MS,
  stopRoomLive,
  useRoomLive,
} from '@/live/roomLive'
import { isRoomConnected, syncRoomAuth } from '@/state/roomAuth'
import { getRoomToken, setDemoMode, setRoomToken } from '@/utils/auth'

import { createFakeLiveServer, helloMessage } from '../_helpers/fakeLiveServer'
import { createManualClock, getPlayableThemes, REGISTRATIONS } from '../_helpers/fixtures'

const REPLACED = 'event: replaced\ndata: {}\n\n'
const SESSION_ENDED = 'event: session_ended\ndata: {"error":"session_expired"}\n\n'

let server: ReturnType<typeof createFakeLiveServer>
const routeName = ref('launch')

/** Laisse passer les promesses en attente (lecture du flux, réponses) et les observateurs Vue. */
async function settle(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
  await nextTick()
  await vi.advanceTimersByTimeAsync(0)
}

/** Démarre la présence et fait répondre le serveur par un `hello`. */
async function connect(hello = helloMessage()): Promise<void> {
  startRoomLive(() => routeName.value)
  await settle()
  server.streams.at(-1)?.push(hello)
  await settle()
}

function streamCalls(): number {
  return server.fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/room/stream')).length
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  setRoomToken('jeton-salle')
  setDemoMode(false)
  syncRoomAuth()
  routeName.value = 'launch'
  server = createFakeLiveServer()
  vi.stubGlobal('fetch', server.fetchMock)
})

afterEach(() => {
  stopRoomLive()
  closeGame()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  localStorage.clear()
  syncRoomAuth()
})

describe('roomLive : ouverture du flux et premier rapport', () => {
  it('ouvre le flux avec l’en-tête Authorization, jamais le jeton dans l’URL', async () => {
    startRoomLive(() => routeName.value)
    await settle()

    const [stream] = server.streams

    expect(stream?.url).toMatch(/\/room\/stream$/)
    expect(stream?.url).not.toContain('jeton-salle')
    expect(stream?.headers.get('Authorization')).toBe('Bearer jeton-salle')
  })

  it('publie l’état dès le hello, avec l’identifiant du flux', async () => {
    await connect()

    expect(server.statuses).toHaveLength(1)
    expect(server.statuses[0]?.headers.get('Authorization')).toBe('Bearer jeton-salle')
    expect(server.statuses[0]?.body).toEqual({
      streamId: 'stream-1',
      screen: 'launch',
      gameId: null,
      phase: null,
      round: null,
      questionIndex: null,
      miniGame: null,
      paused: false,
      scores: [],
      audioReady: false,
    })
  })

  it('ne publie rien avant le hello', async () => {
    startRoomLive(() => routeName.value)
    await settle(5000)

    expect(server.statuses).toHaveLength(0)
  })

  it('lit un flux coupé n’importe où, y compris au milieu d’un mot ou d’un \\r\\n', async () => {
    startRoomLive(() => routeName.value)
    await settle()

    const message = helloMessage('coupe').replace(/\n/g, '\r\n')

    // Coupures au milieu d'un mot, puis un retour chariot seul (il finit déjà la ligne vide), puis
    // le saut de ligne qui le suit.
    for (const piece of [message.slice(0, 3), message.slice(3, 40), message.slice(40, -2)]) {
      server.streams[0]?.push(piece)
      await settle()
    }
    expect(server.statuses).toHaveLength(0)

    server.streams[0]?.push(String.fromCodePoint(13))
    await settle()
    expect(server.statuses).toHaveLength(1)

    server.streams[0]?.push(String.fromCodePoint(10))
    await settle(MIN_PUBLISH_GAP_MS)

    // Le CRLF coupé en deux ne compte que pour une fin de ligne : un seul rapport.
    expect(server.statuses).toHaveLength(1)
    expect(server.statuses[0]?.body.streamId).toBe('coupe')
  })

  it('n’ouvre qu’un flux si on démarre deux fois', async () => {
    startRoomLive(() => routeName.value)
    startRoomLive()
    await settle()

    expect(streamCalls()).toBe(1)
  })
})

describe('roomLive : publication', () => {
  it('publie à chaque changement d’écran, au plus un envoi par seconde, le dernier état gagne', async () => {
    await connect()
    expect(server.statuses).toHaveLength(1)

    routeName.value = 'lobby'
    await settle(100)
    routeName.value = 'play'
    await settle(MIN_PUBLISH_GAP_MS - 100 - 1)

    // Les deux changements attendent la fin de la seconde, puis partent en un seul rapport.
    expect(server.statuses).toHaveLength(1)

    await settle(1)

    expect(server.statuses).toHaveLength(2)
    expect(server.statuses[1]?.body.screen).toBe('play')
  })

  it('envoie tout de suite un changement quand le dernier envoi date de plus d’une seconde', async () => {
    await connect()
    await settle(MIN_PUBLISH_GAP_MS + 500)

    routeName.value = 'lobby'
    await settle()

    expect(server.statuses).toHaveLength(2)
    expect(server.statuses[1]?.body.screen).toBe('lobby')
  })

  it('ne renvoie rien quand l’état ne change pas, sauf au rythme minimal du hello', async () => {
    await connect(helloMessage('s', LIVE_HEARTBEAT_MS, 20_000))

    await settle(19_999)
    expect(server.statuses).toHaveLength(1)

    await settle(1)
    expect(server.statuses).toHaveLength(2)

    await settle(20_000)
    expect(server.statuses).toHaveLength(3)
  })

  it('garde le rythme par défaut si le hello n’en donne pas', async () => {
    await connect(`event: hello\ndata: ${JSON.stringify({ streamId: 'sans-delais' })}\n\n`)

    await settle(LIVE_STATUS_EVERY_MS - 1)
    expect(server.statuses).toHaveLength(1)

    await settle(1)
    expect(server.statuses).toHaveLength(2)
  })

  it('ignore un hello sans identifiant de flux ou illisible', async () => {
    startRoomLive(() => routeName.value)
    await settle()
    server.streams[0]?.push('event: hello\ndata: {"heartbeatMs":1000}\n\n')
    server.streams[0]?.push('event: hello\ndata: pas-du-json\n\n')
    server.streams[0]?.push('event: inconnu\ndata: {}\n\n')
    await settle(LIVE_STATUS_EVERY_MS * 2)

    expect(server.statuses).toHaveLength(0)
  })

  it('signale la partie : identifiant du backoffice, phase, pause', async () => {
    const clock = createManualClock()

    configureRoomGame({
      storage: createMemorySessionStorage(),
      player: createSilentExtractPlayer(),
      now: clock.now,
    })
    await connect()

    const session = startNewGame({
      registrations: REGISTRATIONS,
      themes: getPlayableThemes(),
      seed: 7,
    })

    rememberBackofficeGameId(12, 7)
    await settle(MIN_PUBLISH_GAP_MS)

    expect(server.statuses.at(-1)?.body).toMatchObject({
      gameId: 12,
      phase: 'round_intro',
      paused: false,
    })
    expect(session.state.setup.seed).toBe(7)

    pauseGame()
    await settle(MIN_PUBLISH_GAP_MS)

    expect(useRoomGame().paused.value).toBe(true)
    expect(server.statuses.at(-1)?.body.paused).toBe(true)
    expect(JSON.stringify(server.statuses.at(-1)?.body)).not.toMatch(/Léa|Hugo|Inès|@/)
  })

  it('dit que le son est prêt quand le navigateur a vu un geste de l’utilisateur', async () => {
    await connect()
    expect(server.statuses[0]?.body.audioReady).toBe(false)

    Object.defineProperty(navigator, 'userActivation', {
      value: { hasBeenActive: true },
      configurable: true,
    })

    try {
      await settle(LIVE_STATUS_EVERY_MS)
    } finally {
      Reflect.deleteProperty(navigator, 'userActivation')
    }

    expect(server.statuses.at(-1)?.body.audioReady).toBe(true)
  })

  it('un envoi lent n’en laisse pas partir un deuxième, et abandonne après le délai', async () => {
    await connect()
    server.setStatusReply('hang')

    routeName.value = 'lobby'
    await settle(MIN_PUBLISH_GAP_MS)
    expect(server.statuses).toHaveLength(2)

    routeName.value = 'play'
    await settle(MIN_PUBLISH_GAP_MS)
    expect(server.statuses).toHaveLength(2)

    await settle(STATUS_TIMEOUT_MS)
    expect(server.statuses[1]?.aborted).toBe(true)

    // L'état changé pendant l'envoi lent part ensuite.
    server.setStatusReply({ status: 204 })
    await settle(MIN_PUBLISH_GAP_MS)
    expect(server.statuses.at(-1)?.body.screen).toBe('play')
  })

  it('un refus 400 n’arrête rien : le rapport suivant part au prochain changement', async () => {
    await connect()
    server.setStatusReply({ status: 400, body: { error: 'invalid_body' } })
    routeName.value = 'lobby'
    await settle(MIN_PUBLISH_GAP_MS)

    server.setStatusReply({ status: 204 })
    routeName.value = 'play'
    await settle(MIN_PUBLISH_GAP_MS)

    expect(server.statuses.at(-1)?.body.screen).toBe('play')
    expect(useRoomLive().replaced.value).toBe(false)
  })
})

describe('roomLive : reconnexion du flux', () => {
  it('rouvre le flux après 1, 2, 5, 10 puis 30 s (30 s ensuite)', async () => {
    server.setStreamReply('network-error')
    startRoomLive(() => routeName.value)
    await settle()
    expect(streamCalls()).toBe(1)

    let expected = 1

    for (const delay of [...RECONNECT_DELAYS_MS, RECONNECT_DELAYS_MS.at(-1) ?? 0]) {
      await settle(delay - 1)
      expect(streamCalls()).toBe(expected)
      await settle(1)
      expected += 1
      expect(streamCalls()).toBe(expected)
    }
  })

  it('rouvre le flux sur une réponse en erreur du serveur', async () => {
    server.setStreamReply({ status: 503 })
    startRoomLive(() => routeName.value)
    await settle(RECONNECT_DELAYS_MS[0])

    expect(streamCalls()).toBe(2)
  })

  it('repart de 1 s après un hello, et ne publie plus tant que le flux est perdu', async () => {
    server.setStreamReply('network-error')
    startRoomLive(() => routeName.value)
    await settle(1000 + 2000)
    expect(streamCalls()).toBe(3)

    server.setStreamReply({ status: 200 })
    await settle(5000)
    expect(streamCalls()).toBe(4)
    server.streams[0]?.push(helloMessage())
    await settle()
    expect(server.statuses).toHaveLength(1)

    server.streams[0]?.end()
    await settle()
    routeName.value = 'lobby'
    await settle(MIN_PUBLISH_GAP_MS - 1)
    expect(server.statuses).toHaveLength(1)
    expect(streamCalls()).toBe(4)

    await settle(1)
    expect(streamCalls()).toBe(5)

    // Nouveau hello : l'état courant est renvoyé tout de suite.
    server.streams[1]?.push(helloMessage('stream-2'))
    await settle()
    expect(server.statuses.at(-1)?.body).toMatchObject({ streamId: 'stream-2', screen: 'lobby' })
  })

  it('un flux muet plus de trois battements est abandonné puis rouvert', async () => {
    await connect()
    const silenceMs = LIVE_HEARTBEAT_MS * 3

    await settle(silenceMs)
    expect(server.streams[0]?.aborted).toBe(false)

    await settle(1000)
    expect(server.streams[0]?.aborted).toBe(true)

    await settle(RECONNECT_DELAYS_MS[0])
    expect(streamCalls()).toBe(2)
  })

  it('les lignes : ping gardent le flux ouvert', async () => {
    await connect()

    for (let beat = 0; beat < 12; beat += 1) {
      await settle(LIVE_HEARTBEAT_MS)
      server.streams[0]?.push(': ping\n\n')
      await settle()
    }

    expect(server.streams[0]?.aborted).toBe(false)
    expect(streamCalls()).toBe(1)
  })

  it('un flux muet avant tout hello est aussi rouvert', async () => {
    startRoomLive(() => routeName.value)
    await settle(LIVE_HEARTBEAT_MS * 3 + 1000)

    expect(server.streams[0]?.aborted).toBe(true)
  })
})

describe('roomLive : salle ouverte sur un autre poste', () => {
  it('replaced : arrêt du flux et de la publication, sans reconnexion automatique', async () => {
    await connect()

    server.streams[0]?.push(REPLACED)
    await settle()

    expect(useRoomLive().replaced.value).toBe(true)
    expect(server.streams[0]?.aborted).toBe(true)

    routeName.value = 'lobby'
    await settle(LIVE_STATUS_EVERY_MS * 4 + 30_000)

    expect(streamCalls()).toBe(1)
    expect(server.statuses).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('409 room_instance_replaced : même traitement', async () => {
    await connect()
    server.setStatusReply({ status: 409, body: { error: 'room_instance_replaced' } })

    routeName.value = 'lobby'
    await settle(MIN_PUBLISH_GAP_MS)

    expect(useRoomLive().replaced.value).toBe(true)
    expect(server.streams[0]?.aborted).toBe(true)

    await settle(LIVE_STATUS_EVERY_MS * 4 + 30_000)
    expect(streamCalls()).toBe(1)
    expect(server.statuses).toHaveLength(2)
  })

  it('un autre 409 n’est pas un remplacement', async () => {
    await connect()
    server.setStatusReply({ status: 409, body: { error: 'autre_chose' } })

    routeName.value = 'lobby'
    await settle(MIN_PUBLISH_GAP_MS)

    expect(useRoomLive().replaced.value).toBe(false)
    expect(server.streams[0]?.aborted).toBe(false)
  })

  it('la partie en cours n’est jamais interrompue', async () => {
    const clock = createManualClock()

    configureRoomGame({
      storage: createMemorySessionStorage(),
      player: createSilentExtractPlayer(),
      now: clock.now,
    })
    await connect()
    startNewGame({ registrations: REGISTRATIONS, themes: getPlayableThemes(), seed: 3 })

    server.streams[0]?.push(REPLACED)
    await settle()

    const { session, state } = useRoomGame()

    expect(session.value).not.toBeNull()
    expect(state.value?.phase.name).toBe('round_intro')
    expect(getRoomToken()).toBe('jeton-salle')
  })

  it('« Reprendre la main ici » relance le flux et efface l’avis', async () => {
    await connect()
    server.streams[0]?.push(REPLACED)
    await settle()
    expect(useRoomLive().replaced.value).toBe(true)

    startRoomLive()
    await settle()

    expect(useRoomLive().replaced.value).toBe(false)
    expect(streamCalls()).toBe(2)

    server.streams[1]?.push(helloMessage('stream-2'))
    await settle()
    expect(server.statuses.at(-1)?.body.streamId).toBe('stream-2')
  })
})

describe('roomLive : session de salle terminée', () => {
  it.each([
    ['l’événement session_ended', () => server.streams[0]?.push(SESSION_ENDED)],
    ['un 401 sur POST /room/status', () => server.setStatusReply({ status: 401 })],
  ])(
    '%s : comme un jeton refusé, la salle est déconnectée et le suivi s’arrête',
    async (_label, trigger) => {
      await connect()
      expect(isRoomConnected.value).toBe(true)

      trigger()
      routeName.value = 'lobby'
      await settle(MIN_PUBLISH_GAP_MS)

      expect(getRoomToken()).toBeNull()
      expect(isRoomConnected.value).toBe(false)
      expect(useRoomLive().sessionEnded.value).toBe(true)
      expect(server.streams[0]?.aborted).toBe(true)

      await settle(60_000)
      expect(streamCalls()).toBe(1)
      expect(vi.getTimerCount()).toBe(0)
    }
  )

  it('un 401 à l’ouverture du flux : même traitement, sans reconnexion', async () => {
    server.setStreamReply({ status: 401 })
    startRoomLive(() => routeName.value)
    await settle(60_000)

    expect(getRoomToken()).toBeNull()
    expect(useRoomLive().sessionEnded.value).toBe(true)
    expect(streamCalls()).toBe(1)
  })

  it('avec une partie ouverte, la partie continue et la salle n’est déconnectée qu’à sa fermeture', async () => {
    const clock = createManualClock()

    configureRoomGame({
      storage: createMemorySessionStorage(),
      player: createSilentExtractPlayer(),
      now: clock.now,
    })
    await connect()
    startNewGame({ registrations: REGISTRATIONS, themes: getPlayableThemes(), seed: 3 })

    server.streams[0]?.push(SESSION_ENDED)
    await settle(5000)

    expect(getRoomToken()).toBe('jeton-salle')
    expect(useRoomGame().session.value).not.toBeNull()
    expect(server.streams[0]?.aborted).toBe(true)

    closeGame()
    await settle()

    expect(getRoomToken()).toBeNull()
  })

  it('un nouveau démarrage après la connexion efface l’avis et l’attente de déconnexion', async () => {
    const clock = createManualClock()

    configureRoomGame({
      storage: createMemorySessionStorage(),
      player: createSilentExtractPlayer(),
      now: clock.now,
    })
    await connect()
    startNewGame({ registrations: REGISTRATIONS, themes: getPlayableThemes(), seed: 3 })
    server.streams[0]?.push(SESSION_ENDED)
    await settle()

    stopRoomLive()
    startRoomLive()
    await settle()
    expect(useRoomLive().sessionEnded.value).toBe(false)

    closeGame()
    await settle()
    expect(getRoomToken()).toBe('jeton-salle')
  })
})

describe('roomLive : mode démo, arrêt et pannes réseau', () => {
  it('mode démo : aucun appel réseau', async () => {
    setDemoMode(true)
    startRoomLive(() => routeName.value)
    await settle(60_000)

    expect(server.fetchMock).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('sans jeton : aucun appel réseau', async () => {
    setRoomToken(null)
    startRoomLive(() => routeName.value)
    await settle(60_000)

    expect(server.fetchMock).not.toHaveBeenCalled()
  })

  it('stopRoomLive : requêtes abandonnées, plus aucune minuterie, plus aucun appel', async () => {
    await connect()
    server.setStatusReply('hang')
    routeName.value = 'lobby'
    await settle(MIN_PUBLISH_GAP_MS)
    routeName.value = 'play'
    await settle()
    const calls = server.fetchMock.mock.calls.length

    stopRoomLive()

    expect(server.streams[0]?.aborted).toBe(true)
    expect(server.statuses[1]?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)

    routeName.value = 'lobby'
    await settle(120_000)
    expect(server.fetchMock.mock.calls).toHaveLength(calls)
  })

  it('stopRoomLive pendant l’attente d’une reconnexion annule cette reconnexion', async () => {
    server.setStreamReply('network-error')
    startRoomLive(() => routeName.value)
    await settle()

    stopRoomLive()
    await settle(60_000)

    expect(streamCalls()).toBe(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('une erreur réseau sur le flux et sur les rapports ne touche pas à la partie', async () => {
    const clock = createManualClock()

    configureRoomGame({
      storage: createMemorySessionStorage(),
      player: createSilentExtractPlayer(),
      now: clock.now,
    })
    await connect()
    server.setStatusReply('network-error')

    const session = startNewGame({
      registrations: REGISTRATIONS,
      themes: getPlayableThemes(),
      seed: 3,
    })

    server.streams[0]?.end()
    await settle(MIN_PUBLISH_GAP_MS)
    server.setStreamReply('network-error')
    await settle(60_000)

    clock.advance(10_000)
    await settle(50)

    expect(session.isOver).toBe(false)
    expect(useRoomGame().state.value?.phase.name).not.toBe('round_intro')
    expect(useRoomGame().session.value).toBe(session)
  })
})
