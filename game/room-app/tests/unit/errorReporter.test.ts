import { ROOM_LOG_BATCH_MAX_ENTRIES, ROOM_LOG_OCCURRENCES_MAX } from '@quizzup/shared'

import {
  errorText,
  FLUSH_EVERY_MS,
  flushRoomErrors,
  MAX_BUFFERED_ENTRIES,
  reportRoomError,
  resetErrorReporter,
  startErrorReporter,
} from '@/diagnostics/errorReporter'
import { setDemoMode, setRoomToken } from '@/utils/auth'

import { version } from '../../package.json'

const API = 'http://localhost:3001'

type Sent = {
  appVersion: string
  entries: Array<{
    level: string
    code: string
    message: string
    context?: Record<string, unknown>
    occurrences: number
    occurredAt: string
  }>
}

function answer(status = 204) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(() =>
      Promise.resolve(
        status === 204
          ? new Response(null, { status })
          : new Response(JSON.stringify({ error: 'x' }), { status })
      )
    )
}

function sentBody(fetchMock: ReturnType<typeof answer>, call = 0): Sent {
  return JSON.parse(String(fetchMock.mock.calls[call]?.[1]?.body)) as Sent
}

describe("journaux d'erreurs de la salle", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-23T10:00:00.000Z'))
    localStorage.clear()
    setRoomToken('tok')
  })

  afterEach(() => {
    resetErrorReporter()
    vi.restoreAllMocks()
    vi.useRealTimers()
    localStorage.clear()
  })

  it('envoie les erreurs avec le jeton de la salle et la version de l’écran', async () => {
    const fetchMock = answer()

    reportRoomError('dmx_output_error', 'Interface débranchée', { context: { driver: 'usbpro' } })
    await flushRoomErrors()

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(`${API}/room/logs`)
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer tok')
    expect(sentBody(fetchMock)).toEqual({
      appVersion: version,
      entries: [
        {
          level: 'error',
          code: 'dmx_output_error',
          message: 'Interface débranchée',
          context: { driver: 'usbpro' },
          occurrences: 1,
          occurredAt: '2026-11-23T10:00:00.000Z',
        },
      ],
    })
  })

  it('n’envoie qu’une fois : la mémoire est vidée après un envoi réussi', async () => {
    const fetchMock = answer()
    reportRoomError('vue_error', 'boom')

    await flushRoomErrors()
    await flushRoomErrors()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('regroupe une erreur qui se répète et garde la date de la première', async () => {
    const fetchMock = answer()

    reportRoomError('audio_play_failed', 'decode', { level: 'warn' })
    vi.setSystemTime(new Date('2026-11-23T10:05:00.000Z'))
    reportRoomError('audio_play_failed', 'decode', { level: 'warn' })
    reportRoomError('audio_play_failed', 'autre message', { level: 'warn' })
    await flushRoomErrors()

    expect(sentBody(fetchMock).entries).toMatchObject([
      { code: 'audio_play_failed', message: 'decode', occurrences: 2, level: 'warn' },
      { message: 'autre message', occurrences: 1 },
    ])
    expect(sentBody(fetchMock).entries[0]?.occurredAt).toBe('2026-11-23T10:00:00.000Z')
  })

  it('ne regroupe pas deux erreurs de contexte différent', async () => {
    const fetchMock = answer()

    reportRoomError('dmx_output_error', 'x', { context: { desk: 1 } })
    reportRoomError('dmx_output_error', 'x', { context: { desk: 2 } })
    await flushRoomErrors()

    expect(sentBody(fetchMock).entries).toHaveLength(2)
  })

  it('plafonne le nombre de répétitions regroupées', async () => {
    const fetchMock = answer()

    for (let index = 0; index < ROOM_LOG_OCCURRENCES_MAX + 5; index += 1) {
      reportRoomError('vue_error', 'boucle')
    }
    await flushRoomErrors()

    expect(sentBody(fetchMock).entries[0]?.occurrences).toBe(ROOM_LOG_OCCURRENCES_MAX)
  })

  it('masque les adresses e-mail et écarte le contexte hors liste blanche', async () => {
    const fetchMock = answer()

    reportRoomError('window_error', 'Refus pour lea@exemple.fr (HTTP 400)', {
      context: { route: 'play', displayName: 'Léa', email: 'lea@exemple.fr', desk: 3 } as never,
    })
    await flushRoomErrors()

    const [entry] = sentBody(fetchMock).entries
    expect(entry?.message).toBe('Refus pour [email] (HTTP 400)')
    expect(entry?.context).toEqual({ route: 'play', desk: 3 })
    expect(JSON.stringify(sentBody(fetchMock))).not.toContain('exemple.fr')
    expect(JSON.stringify(sentBody(fetchMock))).not.toContain('Léa')
  })

  it('remplace un message vide par le code (le serveur refuse un message vide)', async () => {
    const fetchMock = answer()

    reportRoomError('vue_error', '   ')
    await flushRoomErrors()

    expect(sentBody(fetchMock).entries[0]?.message).toBe('vue_error')
  })

  it('coupe le message à 300 caractères', async () => {
    const fetchMock = answer()

    reportRoomError('vue_error', 'x'.repeat(500))
    await flushRoomErrors()

    expect(sentBody(fetchMock).entries[0]?.message).toHaveLength(300)
  })

  it('envoie 50 entrées au plus par paquet, le reste au passage suivant', async () => {
    const fetchMock = answer()

    for (let index = 0; index < ROOM_LOG_BATCH_MAX_ENTRIES + 10; index += 1) {
      reportRoomError('vue_error', `erreur ${index}`)
    }
    await flushRoomErrors()
    await flushRoomErrors()

    expect(sentBody(fetchMock, 0).entries).toHaveLength(ROOM_LOG_BATCH_MAX_ENTRIES)
    expect(sentBody(fetchMock, 1).entries).toHaveLength(10)
    expect(sentBody(fetchMock, 1).entries[0]?.message).toBe(`erreur ${ROOM_LOG_BATCH_MAX_ENTRIES}`)
  })

  it('garde les 100 entrées les plus récentes quand le réseau manque', async () => {
    const fetchMock = answer()

    for (let index = 0; index < MAX_BUFFERED_ENTRIES + 3; index += 1) {
      reportRoomError('vue_error', `erreur ${index}`)
    }
    await flushRoomErrors()

    expect(sentBody(fetchMock).entries[0]?.message).toBe('erreur 3')
  })

  it('n’envoie rien sans jeton ni en mode démo, et garde les erreurs pour plus tard', async () => {
    const fetchMock = answer()
    reportRoomError('vue_error', 'boom')

    setRoomToken(null)
    await flushRoomErrors()
    setRoomToken('tok')
    setDemoMode(true)
    await flushRoomErrors()
    expect(fetchMock).not.toHaveBeenCalled()

    setDemoMode(false)
    await flushRoomErrors()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('ne fait rien quand il n’y a rien à envoyer', async () => {
    const fetchMock = answer()

    await flushRoomErrors()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('garde les erreurs quand le réseau est coupé, sans jamais lever', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('offline'))
    reportRoomError('vue_error', 'boom')

    await expect(flushRoomErrors()).resolves.toBeUndefined()

    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })))
    await flushRoomErrors()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sentBody(fetchMock, 1).entries).toHaveLength(1)
  })

  it.each([401, 403, 429, 500])(
    'garde les erreurs sur un %i (nouvel essai plus tard)',
    async (status) => {
      const fetchMock = answer(status)
      reportRoomError('vue_error', 'boom')

      await flushRoomErrors()
      fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })))
      await flushRoomErrors()

      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(sentBody(fetchMock, 1).entries).toHaveLength(1)
    }
  )

  it.each([400, 413])('abandonne un paquet refusé pour de bon (%i)', async (status) => {
    const fetchMock = answer(status)
    reportRoomError('vue_error', 'boom')

    await flushRoomErrors()
    await flushRoomErrors()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('garde les répétitions notées pendant l’envoi', async () => {
    let finish!: () => void
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(new Response(null, { status: 204 }))
        })
    )
    reportRoomError('vue_error', 'boom')

    const sending = flushRoomErrors()
    reportRoomError('vue_error', 'boom')
    finish()
    await sending

    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })))
    await flushRoomErrors()

    expect(sentBody(fetchMock, 0).entries[0]?.occurrences).toBe(1)
    expect(sentBody(fetchMock, 1).entries[0]?.occurrences).toBe(1)
  })

  it('ne lance pas deux envois à la fois', async () => {
    const fetchMock = answer()
    reportRoomError('vue_error', 'boom')

    await Promise.all([flushRoomErrors(), flushRoomErrors()])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('ne supprime pas une entrée évincée de la mémoire pendant l’envoi', async () => {
    let finish!: () => void
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(new Response(null, { status: 204 }))
        })
    )
    for (let index = 0; index < MAX_BUFFERED_ENTRIES; index += 1) {
      reportRoomError('vue_error', `erreur ${index}`)
    }

    const sending = flushRoomErrors()
    // Cette entrée évince la plus ancienne (déjà partie dans le paquet).
    reportRoomError('vue_error', 'nouvelle')
    finish()
    await sending

    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })))
    await flushRoomErrors()
    await flushRoomErrors()

    // « erreur 0 » est partie dans le premier paquet puis évincée : elle ne doit pas coûter une autre entrée.
    expect(sentBody(fetchMock, 1).entries).toHaveLength(ROOM_LOG_BATCH_MAX_ENTRIES)
    expect(sentBody(fetchMock, 1).entries[0]?.message).toBe(`erreur ${ROOM_LOG_BATCH_MAX_ENTRIES}`)
    expect(sentBody(fetchMock, 2).entries.map((entry) => entry.message)).toEqual(['nouvelle'])
  })

  describe('écoute de la page', () => {
    it('note les erreurs et les promesses rejetées non gérées', async () => {
      const fetchMock = answer()
      const stop = startErrorReporter()

      window.dispatchEvent(new ErrorEvent('error', { message: 'ReferenceError: x is not defined' }))
      window.dispatchEvent(new ErrorEvent('error', { message: '', error: new TypeError('nul') }))
      window.dispatchEvent(
        Object.assign(new Event('unhandledrejection'), { reason: new Error('refusée') })
      )
      await flushRoomErrors()
      stop()

      expect(sentBody(fetchMock).entries).toMatchObject([
        { code: 'window_error', message: 'ReferenceError: x is not defined' },
        { code: 'window_error', message: 'nul' },
        { code: 'unhandled_rejection', message: 'refusée' },
      ])
    })

    it('envoie toutes les 30 secondes et au retour du réseau', async () => {
      const fetchMock = answer()
      const stop = startErrorReporter()

      reportRoomError('vue_error', 'une')
      await vi.advanceTimersByTimeAsync(FLUSH_EVERY_MS)
      expect(fetchMock).toHaveBeenCalledTimes(1)

      reportRoomError('vue_error', 'deux')
      window.dispatchEvent(new Event('online'))
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchMock).toHaveBeenCalledTimes(2)

      stop()
    })

    it('ne laisse ni écouteur ni minuterie une fois arrêtée', async () => {
      const fetchMock = answer()
      const stop = startErrorReporter()
      stop()

      window.dispatchEvent(new ErrorEvent('error', { message: 'après arrêt' }))
      window.dispatchEvent(new Event('online'))
      await vi.advanceTimersByTimeAsync(FLUSH_EVERY_MS * 2)

      expect(fetchMock).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    })

    it('remplace l’écoute précédente quand on la démarre deux fois', async () => {
      // jsdom programme des minuteurs pour ses écritures dans `localStorage` : on les laisse passer.
      await vi.advanceTimersByTimeAsync(1)
      const before = vi.getTimerCount()

      startErrorReporter()
      startErrorReporter()

      expect(vi.getTimerCount()).toBe(before + 1)
    })
  })

  describe('errorText', () => {
    it.each([
      [new Error('boom'), 'boom'],
      [new TypeError(''), 'TypeError'],
      ['texte', 'texte'],
      [{ secret: 'Léa' }, 'unknown_error'],
      [undefined, 'unknown_error'],
    ])('%o devient %s', (reason, expected) => {
      expect(errorText(reason)).toBe(expected)
    })
  })
})
