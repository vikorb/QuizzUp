import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  enqueuePendingFinish,
  flushPendingFinishes,
  PENDING_FINISHES_KEY,
  type PendingFinish,
  readPendingFinishes,
  resetPendingFinishes,
  RETRY_DELAYS_MS,
  usePendingFinishes,
} from '@/game/pendingFinishes'
import { setRoomToken } from '@/utils/auth'
import type * as RoomApi from '@/utils/roomApi'
import { finishRoomGame, RoomApiError } from '@/utils/roomApi'

vi.mock('@/utils/roomApi', async (importOriginal) => ({
  ...(await importOriginal<typeof RoomApi>()),
  finishRoomGame: vi.fn(),
}))

const finish = vi.mocked(finishRoomGame)

function report(gameId: number, score = 100): PendingFinish {
  return { gameId, seed: gameId * 10, scores: [{ podium: 1, score }] }
}

function stored(): unknown {
  return JSON.parse(localStorage.getItem(PENDING_FINISHES_KEY) ?? '[]')
}

/** Minuteurs encore programmés (jsdom en crée pour chaque écriture dans `localStorage` : on les purge). */
async function timersLeft(): Promise<number> {
  await vi.advanceTimersByTimeAsync(1)
  return vi.getTimerCount()
}

/** Appel de `finishRoomGame` en attente, résolu ou rejeté à la main. */
function deferred() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<never>((ok, ko) => {
    resolve = () => ok(undefined as never)
    reject = ko
  })
  return { promise, resolve, reject }
}

describe('file des résultats de partie à envoyer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    setRoomToken('tok')
    finish.mockReset()
    finish.mockResolvedValue({ id: 1 } as never)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('lecture et écriture', () => {
    it('est vide sans rien de stocké, avec un JSON illisible ou un autre format', () => {
      expect(readPendingFinishes()).toEqual([])

      localStorage.setItem(PENDING_FINISHES_KEY, '{pas du json')
      expect(readPendingFinishes()).toEqual([])

      localStorage.setItem(PENDING_FINISHES_KEY, '{"gameId":3}')
      expect(readPendingFinishes()).toEqual([])
    })

    it('ignore les éléments invalides et les doublons', () => {
      localStorage.setItem(
        PENDING_FINISHES_KEY,
        JSON.stringify([
          report(3),
          { gameId: 0, seed: 1, scores: [] },
          { gameId: 4, seed: 'x', scores: [] },
          { gameId: 5, seed: 1, scores: [{ podium: 1 }] },
          { gameId: 6, seed: 1, scores: [{ podium: 1, score: null }] },
          { gameId: 7, seed: 1, scores: 'oops' },
          null,
          'texte',
          { ...report(3), seed: 999 },
          report(8),
        ])
      )

      expect(readPendingFinishes().map((item) => item.gameId)).toEqual([3, 8])
      expect(readPendingFinishes()[0]).toEqual(report(3))
    })

    it('garde le compte à jour pour l’affichage', async () => {
      finish.mockRejectedValue(new Error('offline'))
      const { count } = usePendingFinishes()
      expect(count.value).toBe(0)

      await enqueuePendingFinish(report(1))
      await enqueuePendingFinish(report(2))
      expect(count.value).toBe(2)

      localStorage.clear()
      expect(usePendingFinishes().count.value).toBe(0)
    })

    it('survit au stockage indisponible sans planter', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota')
      })
      await expect(enqueuePendingFinish(report(1))).resolves.toBeUndefined()
      expect(finish).not.toHaveBeenCalled()
    })
  })

  describe('envoi', () => {
    it('enregistre le rapport puis l’envoie tout de suite, et le retire en cas de succès', async () => {
      const call = deferred()
      finish.mockReturnValueOnce(call.promise)
      const { status, count } = usePendingFinishes()

      const sending = enqueuePendingFinish(report(7, 900))

      expect(stored()).toEqual([report(7, 900)])
      expect(count.value).toBe(1)
      expect(status.value).toBe('sending')
      expect(finish).toHaveBeenCalledWith('tok', 7, [{ podium: 1, score: 900 }])

      call.resolve()
      await sending

      expect(stored()).toEqual([])
      expect(localStorage.getItem(PENDING_FINISHES_KEY)).toBeNull()
      expect(count.value).toBe(0)
      expect(status.value).toBe('sent')
      expect(await timersLeft()).toBe(0)
    })

    it('ne met pas deux fois la même partie en file', async () => {
      finish.mockRejectedValue(new Error('offline'))

      await enqueuePendingFinish(report(7, 900))
      await enqueuePendingFinish(report(7, 1))

      expect(stored()).toEqual([report(7, 900)])
    })

    it('ne fait rien quand la file est vide', async () => {
      const { status } = usePendingFinishes()

      await flushPendingFinishes()

      expect(finish).not.toHaveBeenCalled()
      expect(status.value).toBe('idle')
      expect(await timersLeft()).toBe(0)
    })

    it('envoie les parties en attente dans l’ordre, une à la fois', async () => {
      localStorage.setItem(PENDING_FINISHES_KEY, JSON.stringify([report(1), report(2), report(3)]))
      const first = deferred()
      const second = deferred()
      finish.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

      const done = flushPendingFinishes()
      expect(finish).toHaveBeenCalledTimes(1)
      expect(finish.mock.calls[0]?.[1]).toBe(1)

      // Un nouveau déclenchement pendant l'envoi ne double pas l'appel.
      void flushPendingFinishes()
      expect(finish).toHaveBeenCalledTimes(1)

      first.resolve()
      await vi.advanceTimersByTimeAsync(0)
      expect(finish).toHaveBeenCalledTimes(2)
      expect(finish.mock.calls[1]?.[1]).toBe(2)
      expect(readPendingFinishes().map((item) => item.gameId)).toEqual([2, 3])

      second.resolve()
      await done

      expect(finish.mock.calls.map((call) => call[1])).toEqual([1, 2, 3])
      expect(readPendingFinishes()).toEqual([])
    })

    it('envoie aussi un rapport ajouté pendant un envoi', async () => {
      const first = deferred()
      finish.mockReturnValueOnce(first.promise)

      const sending = enqueuePendingFinish(report(1))
      const second = enqueuePendingFinish(report(2))
      first.resolve()
      await Promise.all([sending, second])

      expect(finish.mock.calls.map((call) => call[1])).toEqual([1, 2])
      expect(readPendingFinishes()).toEqual([])
    })

    it('garde l’ordre : si la première partie échoue, la suivante attend', async () => {
      localStorage.setItem(PENDING_FINISHES_KEY, JSON.stringify([report(1), report(2)]))
      finish.mockRejectedValueOnce(new Error('offline'))

      await flushPendingFinishes()

      expect(finish).toHaveBeenCalledTimes(1)
      expect(readPendingFinishes().map((item) => item.gameId)).toEqual([1, 2])

      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0])

      expect(finish.mock.calls.map((call) => call[1])).toEqual([1, 1, 2])
      expect(readPendingFinishes()).toEqual([])
    })

    it('reprend après un redémarrage de la page, nouvelle partie lancée entre-temps comprise', async () => {
      finish.mockRejectedValueOnce(new Error('offline'))
      await enqueuePendingFinish(report(1))
      resetPendingFinishes() // la page est fermée : plus de minuteur, plus d'état en mémoire
      expect(await timersLeft()).toBe(0)

      finish.mockRejectedValueOnce(new Error('offline'))
      await enqueuePendingFinish(report(2))
      resetPendingFinishes()
      expect(readPendingFinishes().map((item) => item.gameId)).toEqual([1, 2])

      await flushPendingFinishes()

      expect(finish.mock.calls.slice(2).map((call) => call[1])).toEqual([1, 2])
      expect(readPendingFinishes()).toEqual([])
    })
  })

  describe('refus définitifs du backoffice', () => {
    it.each([
      [404, 'game_not_found'],
      [409, 'game_already_over'],
      [400, 'game_scores_invalid'],
    ])('retire la partie sur un %i et passe à la suivante', async (status, code) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      localStorage.setItem(PENDING_FINISHES_KEY, JSON.stringify([report(1), report(2)]))
      finish.mockRejectedValueOnce(new RoomApiError(status, code))

      await flushPendingFinishes()

      expect(finish.mock.calls.map((call) => call[1])).toEqual([1, 2])
      expect(readPendingFinishes()).toEqual([])
      expect(warn).toHaveBeenCalledOnce()
      expect(await timersLeft()).toBe(0)
    })

    it('n’affiche rien de « enregistré » quand rien n’a été accepté', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      finish.mockRejectedValueOnce(new RoomApiError(409, 'game_already_over'))
      const { status } = usePendingFinishes()

      await enqueuePendingFinish(report(1))

      expect(status.value).toBe('idle')
    })
  })

  describe('nouveaux essais', () => {
    it.each([
      ['une erreur réseau', new TypeError('Failed to fetch')],
      ['une erreur 500', new RoomApiError(500, 'server_error')],
      ['une erreur 503', new RoomApiError(503, 'server_error')],
      ['une limitation 429', new RoomApiError(429, 'rate_limited')],
    ])('garde la partie sur %s et la renvoie', async (_label, failure) => {
      finish.mockRejectedValueOnce(failure)
      const { status } = usePendingFinishes()

      await enqueuePendingFinish(report(1))

      expect(readPendingFinishes()).toHaveLength(1)
      expect(status.value).toBe('offline')
      expect(await timersLeft()).toBe(1)

      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0])

      expect(finish).toHaveBeenCalledTimes(2)
      expect(readPendingFinishes()).toEqual([])
      expect(status.value).toBe('sent')
      expect(await timersLeft()).toBe(0)
    })

    it('espace les essais de 2 s, 5 s, 15 s, 30 s puis 60 s, et toutes les 60 s ensuite', async () => {
      expect(RETRY_DELAYS_MS).toEqual([2000, 5000, 15_000, 30_000, 60_000])
      finish.mockRejectedValue(new Error('offline'))

      await enqueuePendingFinish(report(1))
      expect(finish).toHaveBeenCalledTimes(1)

      let expected = 1
      for (const delay of [2000, 5000, 15_000, 30_000, 60_000, 60_000, 60_000]) {
        await vi.advanceTimersByTimeAsync(delay - 1)
        expect(finish).toHaveBeenCalledTimes(expected)
        await vi.advanceTimersByTimeAsync(1)
        expected += 1
        expect(finish).toHaveBeenCalledTimes(expected)
      }
      expect(await timersLeft()).toBe(1)
      expect(readPendingFinishes()).toHaveLength(1)
    })

    it('n’a jamais plus d’un minuteur, et aucun une fois la file vide', async () => {
      finish
        .mockRejectedValueOnce(new Error('offline'))
        .mockRejectedValueOnce(new Error('offline'))
        .mockRejectedValueOnce(new Error('offline'))
      await enqueuePendingFinish(report(1))
      expect(await timersLeft()).toBe(1)

      // Un déclenchement manuel remplace le minuteur au lieu de s'y ajouter.
      await flushPendingFinishes()
      expect(await timersLeft()).toBe(1)
      await enqueuePendingFinish(report(2))
      expect(await timersLeft()).toBe(1)

      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0])
      expect(readPendingFinishes()).toEqual([])
      expect(await timersLeft()).toBe(0)
    })

    it('reste « hors ligne » entre deux essais automatiques, sans clignoter', async () => {
      finish.mockRejectedValue(new Error('offline'))
      const { status } = usePendingFinishes()
      await enqueuePendingFinish(report(1))

      const seen = new Set<string>()
      for (const delay of [2000, 5000]) {
        const waiting = vi.advanceTimersByTimeAsync(delay)
        seen.add(status.value)
        await waiting
        seen.add(status.value)
      }

      expect([...seen]).toEqual(['offline'])
    })

    it('un nouveau rapport est tenté tout de suite, même au milieu d’une longue attente', async () => {
      finish.mockRejectedValue(new Error('offline'))
      await enqueuePendingFinish(report(1))
      await vi.advanceTimersByTimeAsync(2000 + 5000 + 15_000) // prochain essai dans 30 s
      const before = finish.mock.calls.length

      await enqueuePendingFinish(report(2))

      expect(finish.mock.calls.length).toBe(before + 1)
      // Les délais repartent de 2 s.
      await vi.advanceTimersByTimeAsync(2000)
      expect(finish.mock.calls.length).toBe(before + 2)
    })
  })

  describe('retour du réseau', () => {
    it('réessaie tout de suite sur l’événement « online » et repart des délais courts', async () => {
      finish.mockRejectedValue(new Error('offline'))
      await enqueuePendingFinish(report(1))
      await vi.advanceTimersByTimeAsync(2000 + 5000 + 15_000) // en attente de 30 s

      // Le réseau revient, mais la 1re tentative échoue encore ; la suivante réussit.
      finish.mockReset()
      finish.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ id: 1 } as never)
      window.dispatchEvent(new Event('online'))
      await vi.advanceTimersByTimeAsync(0)

      expect(finish).toHaveBeenCalledTimes(1)
      expect(await timersLeft()).toBe(1)
      await vi.advanceTimersByTimeAsync(2000)
      expect(finish).toHaveBeenCalledTimes(2)
      expect(readPendingFinishes()).toEqual([])
      expect(await timersLeft()).toBe(0)
    })

    it('n’écoute plus « online » une fois remise à zéro', async () => {
      localStorage.setItem(PENDING_FINISHES_KEY, JSON.stringify([report(1)]))
      await flushPendingFinishes() // installe l'écoute
      localStorage.setItem(PENDING_FINISHES_KEY, JSON.stringify([report(2)]))
      finish.mockClear()
      resetPendingFinishes()

      window.dispatchEvent(new Event('online'))
      await vi.advanceTimersByTimeAsync(0)

      expect(finish).not.toHaveBeenCalled()
    })

    it('n’installe l’écoute qu’une fois', async () => {
      const add = vi.spyOn(window, 'addEventListener')
      await flushPendingFinishes()
      await flushPendingFinishes()
      await enqueuePendingFinish(report(1))

      expect(add.mock.calls.filter(([type]) => type === 'online')).toHaveLength(1)
    })
  })

  describe('jeton absent ou expiré', () => {
    it.each([401, 403])(
      'garde la partie sur un %i, sans boucle ni minuteur, jusqu’à une reconnexion',
      async (code) => {
        localStorage.setItem(PENDING_FINISHES_KEY, JSON.stringify([report(1), report(2)]))
        finish.mockRejectedValueOnce(new RoomApiError(code, 'unauthorized'))
        const { status } = usePendingFinishes()

        await flushPendingFinishes()

        expect(finish).toHaveBeenCalledTimes(1)
        expect(status.value).toBe('auth')
        expect(await timersLeft()).toBe(0)
        await vi.advanceTimersByTimeAsync(10 * 60_000)
        expect(finish).toHaveBeenCalledTimes(1)
        expect(readPendingFinishes().map((item) => item.gameId)).toEqual([1, 2])

        // La salle se reconnecte : un nouveau jeton, la file se vide.
        setRoomToken('nouveau')
        await flushPendingFinishes()

        expect(finish.mock.calls.slice(1).map((call) => call.slice(0, 2))).toEqual([
          ['nouveau', 1],
          ['nouveau', 2],
        ])
        expect(readPendingFinishes()).toEqual([])
        expect(status.value).toBe('sent')
      }
    )

    it('n’appelle pas le backoffice sans jeton', async () => {
      setRoomToken(null)
      const { status } = usePendingFinishes()

      await enqueuePendingFinish(report(1))

      expect(finish).not.toHaveBeenCalled()
      expect(status.value).toBe('auth')
      expect(await timersLeft()).toBe(0)
      expect(readPendingFinishes()).toHaveLength(1)
    })

    it('une panne réseau après un refus d’authentification relance les essais', async () => {
      finish.mockRejectedValueOnce(new RoomApiError(401, 'unauthorized'))
      const { status } = usePendingFinishes()
      await enqueuePendingFinish(report(1))
      expect(status.value).toBe('auth')

      finish.mockRejectedValueOnce(new Error('offline'))
      await flushPendingFinishes()

      expect(status.value).toBe('offline')
      expect(await timersLeft()).toBe(1)
    })
  })
})
