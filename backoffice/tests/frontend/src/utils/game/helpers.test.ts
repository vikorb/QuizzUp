import { createGameFixture, gamesFixture } from '@frontend-tests/_helpers/gamesServiceMock'
import {
  ADMIN_ROLE_ADMIN,
  ADMIN_ROLE_SUPERADMIN,
  ADMIN_ROLE_USER,
  GAME_STATE_ABORTED,
  GAME_STATE_CANCELLED,
  GAME_STATE_FINISHED,
  GAME_STATE_PENDING,
  GAME_STATE_RUNNING,
  GAME_STATE_SCHEDULED,
  GAME_STATES,
  MINI_GAME_FIRST_BUZZ,
  MINI_GAMES,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import { createErrorBanner, createSuccessBanner } from '@/utils/banner'
import { GAME_BANNER_CREATED, getGameBannerMessage } from '@/utils/game/banner'
import { getGameRouteCompanyId, parseGameId, resolveGameCompanyId } from '@/utils/game/company'
import { getGameErrorKey, isGameApiErrorCode, readGameApiError } from '@/utils/game/errors'
import {
  formatGameDate,
  formatGameDay,
  formatGameDuration,
  formatGameParticipantsCount,
  formatGameTopScore,
  getGameDate,
  getGameMiniGameLabelKey,
  getGamePlayerEmailDisplay,
  getGameRoomName,
  getLocalDayBounds,
} from '@/utils/game/format'
import {
  canAbortGame,
  canShowGameResults,
  getGameStateLabelKey,
  getGameStateTone,
  isGamePendingOrRunning,
  isGameState,
  updateGameInList,
} from '@/utils/game/state'

// Codes d'erreur des sessions programmées (lot 13) → clé i18n de `games.errors`.
const SESSION_ERROR_KEYS: ReadonlyArray<[code: string, key: string]> = [
  ['session_in_past', 'sessionInPast'],
  ['session_too_far', 'sessionTooFar'],
  ['slot_taken', 'slotTaken'],
  ['game_not_scheduled', 'gameNotScheduled'],
  ['session_not_open_yet', 'sessionNotOpenYet'],
]

describe('utils/game/state', () => {
  it('recognises the shared game states only', () => {
    expect(isGameState(GAME_STATE_RUNNING)).toBe(true)
    expect(isGameState('paused')).toBe(false)
    expect(isGameState(1)).toBe(false)
  })

  it('maps each state to a label key and a badge tone', () => {
    expect(getGameStateLabelKey(GAME_STATE_PENDING)).toBe('games.state.pending')
    expect(getGameStateLabelKey('nope')).toBe('games.state.unknown')
    expect(getGameStateTone(GAME_STATE_RUNNING)).toBe('ok')
    expect(getGameStateTone(GAME_STATE_PENDING)).toBe('warn')
    expect(getGameStateTone(GAME_STATE_ABORTED)).toBe('danger')
    expect(getGameStateTone(GAME_STATE_FINISHED)).toBe('muted')
  })

  it('only allows stopping a pending or running game', () => {
    expect(canAbortGame({ state: GAME_STATE_PENDING })).toBe(true)
    expect(canAbortGame({ state: GAME_STATE_RUNNING })).toBe(true)
    expect(canAbortGame({ state: GAME_STATE_FINISHED })).toBe(false)
    expect(canAbortGame({ state: GAME_STATE_ABORTED })).toBe(false)
    expect(canAbortGame(null)).toBe(false)
    // Une session programmée ou annulée n'est pas « ouverte » : on l'annule, on ne l'arrête pas.
    expect(canAbortGame({ state: GAME_STATE_SCHEDULED })).toBe(false)
    expect(canAbortGame({ state: GAME_STATE_CANCELLED })).toBe(false)
  })

  it('shows scheduled and cancelled sessions with a known label and a neutral badge', () => {
    expect(isGameState(GAME_STATE_SCHEDULED)).toBe(true)
    expect(isGameState(GAME_STATE_CANCELLED)).toBe(true)
    expect(getGameStateLabelKey(GAME_STATE_SCHEDULED)).toBe('games.state.scheduled')
    expect(getGameStateLabelKey(GAME_STATE_CANCELLED)).toBe('games.state.cancelled')
    expect(getGameStateTone(GAME_STATE_SCHEDULED)).toBe('muted')
    expect(getGameStateTone(GAME_STATE_CANCELLED)).toBe('muted')
  })

  it('has a French and an English label for every shared game state and session error', async () => {
    const [fr, en] = await Promise.all([
      import('@/locales/fr/games.json'),
      import('@/locales/en/games.json'),
    ])
    for (const locale of [fr.default.games, en.default.games]) {
      for (const state of GAME_STATES) {
        expect(locale.state[state]).toBeTruthy()
      }
      for (const [, key] of SESSION_ERROR_KEYS) {
        expect((locale.errors as Record<string, string>)[key]).toBeTruthy()
      }
    }
  })

  it.each(SESSION_ERROR_KEYS)('maps the session error code %s to its i18n key %s', (code, key) => {
    expect(isGameApiErrorCode(code)).toBe(true)
    expect(readGameApiError({ error: code })).toBe(code)
    expect(getGameErrorKey(code)).toBe(`games.errors.${key}`)
  })

  it('offers the results sheet for a finished game only', () => {
    expect(canShowGameResults({ state: GAME_STATE_FINISHED })).toBe(true)
    expect(canShowGameResults({ state: GAME_STATE_PENDING })).toBe(false)
    expect(canShowGameResults({ state: GAME_STATE_RUNNING })).toBe(false)
    expect(canShowGameResults({ state: GAME_STATE_ABORTED })).toBe(false)
    expect(canShowGameResults(null)).toBe(false)
  })

  it('tells a game that still occupies its room (pending or running) from the others', () => {
    expect(isGamePendingOrRunning({ state: GAME_STATE_PENDING })).toBe(true)
    expect(isGamePendingOrRunning({ state: GAME_STATE_RUNNING })).toBe(true)
    expect(isGamePendingOrRunning({ state: GAME_STATE_FINISHED })).toBe(false)
    expect(isGamePendingOrRunning({ state: GAME_STATE_ABORTED })).toBe(false)
    expect(isGamePendingOrRunning(null)).toBe(false)
  })

  it('merges an updated game into the list and keeps its participants count', () => {
    const updated = updateGameInList(gamesFixture, {
      ...createGameFixture({ id: 4, state: GAME_STATE_ABORTED }),
      participantsCount: undefined,
    })

    expect(updated.find((game) => game.id === 4)?.state).toBe(GAME_STATE_ABORTED)
    expect(updated.find((game) => game.id === 4)?.participantsCount).toBe(2)
  })

  it('keeps the known participants count rather than counting the podiums of the detail', () => {
    // 2 joueurs nommés sur un seul pupitre (2e joueur) : la liste sait 3, le détail n'a qu'1 ligne.
    const listed = [{ ...createGameFixture({ id: 4 }), participantsCount: 3 }]

    const [updated] = updateGameInList(listed, {
      ...createGameFixture({ id: 4, state: GAME_STATE_ABORTED }),
      participantsCount: undefined,
      participants: [
        {
          id: 1,
          podium: 1,
          displayName: 'Léa',
          email: null,
          hasEmail: false,
          consentAt: null,
          marketingConsent: false,
          secondPlayer: null,
          score: 0,
        },
      ],
    })

    expect(updated?.participantsCount).toBe(3)
  })

  it('falls back on the podiums of the detail only when the list does not know the count', () => {
    const [updated] = updateGameInList(
      [{ ...createGameFixture({ id: 4 }), participantsCount: undefined }],
      {
        ...createGameFixture({ id: 4 }),
        participantsCount: undefined,
        participants: [
          {
            id: 1,
            podium: 1,
            displayName: 'Léa',
            email: null,
            hasEmail: false,
            consentAt: null,
            marketingConsent: false,
            secondPlayer: null,
            score: 0,
          },
        ],
      }
    )

    expect(updated?.participantsCount).toBe(1)
  })
})

describe('utils/game/company', () => {
  it('uses the company of the signed-in staff member, whatever the query', () => {
    expect(resolveGameCompanyId({ role: ADMIN_ROLE_ADMIN, companyId: 3 }, '9')).toBe(3)
    expect(resolveGameCompanyId({ role: ADMIN_ROLE_USER, companyId: '5' }, '9')).toBe(5)
  })

  it('lets the superadmin pick another company through the query', () => {
    expect(resolveGameCompanyId({ role: ADMIN_ROLE_SUPERADMIN, companyId: 1 }, '9')).toBe(9)
    expect(resolveGameCompanyId({ role: ADMIN_ROLE_SUPERADMIN, companyId: 1 }, ['7'])).toBe(7)
    expect(resolveGameCompanyId({ role: ADMIN_ROLE_SUPERADMIN, companyId: 1 }, 'abc')).toBe(1)
  })

  it('returns null without a usable company', () => {
    expect(resolveGameCompanyId(null)).toBeNull()
    expect(resolveGameCompanyId({ role: ADMIN_ROLE_USER, companyId: null })).toBeNull()
  })

  it('puts the company in the page address for the superadmin only', () => {
    expect(getGameRouteCompanyId({ role: ADMIN_ROLE_SUPERADMIN, companyId: 1 }, 9)).toBe(9)
    expect(getGameRouteCompanyId({ role: ADMIN_ROLE_ADMIN, companyId: 3 }, 3)).toBeNull()
    expect(getGameRouteCompanyId(null, 3)).toBeNull()
  })

  it('parses positive integer ids only', () => {
    expect(parseGameId('12')).toBe(12)
    expect(parseGameId('0')).toBeNull()
    expect(parseGameId('1.5')).toBeNull()
    expect(parseGameId(undefined)).toBeNull()
  })
})

describe('utils/game/errors', () => {
  it('recognises the game API error codes', () => {
    expect(isGameApiErrorCode('room_busy')).toBe(true)
    expect(isGameApiErrorCode('whatever')).toBe(false)
  })

  it('reads the business error code of a response', () => {
    expect(readGameApiError({ error: 'room_inactive' })).toBe('room_inactive')
    expect(readGameApiError({ error: 'unexpected' })).toBeNull()
    expect(readGameApiError(null)).toBeNull()
  })

  it('surfaces the GDPR consent detail hidden in invalid_body', () => {
    expect(
      readGameApiError({
        error: 'invalid_body',
        details: { formErrors: [], fieldErrors: { participants: ['email_consent_required'] } },
      })
    ).toBe('email_consent_required')
    expect(readGameApiError({ error: 'invalid_body', details: { fieldErrors: {} } })).toBe(
      'invalid_body'
    )
  })

  it('surfaces the offers-without-email detail hidden in invalid_body', () => {
    expect(
      readGameApiError({
        error: 'invalid_body',
        details: {
          formErrors: [],
          fieldErrors: { participants: ['marketing_consent_requires_email'] },
        },
      })
    ).toBe('marketing_consent_requires_email')
    expect(getGameErrorKey('marketing_consent_requires_email')).toBe(
      'games.errors.marketingConsentRequiresEmail'
    )
  })

  it('builds camelCase i18n keys, server error by default', () => {
    expect(getGameErrorKey('room_busy')).toBe('games.errors.roomBusy')
    expect(getGameErrorKey('email_consent_required')).toBe('games.errors.emailConsentRequired')
    expect(getGameErrorKey('nope')).toBe('games.errors.serverError')
    expect(getGameErrorKey(null)).toBe('games.errors.serverError')
  })
})

describe('utils/game/format', () => {
  it('dates a game from its start, or from its creation until it starts', () => {
    expect(
      getGameDate({ startedAt: '2026-11-05T09:00:00.000Z', createdAt: '2026-11-01T10:00:00.000Z' })
    ).toBe('2026-11-05T09:00:00.000Z')
    expect(getGameDate({ startedAt: null, createdAt: '2026-11-01T10:00:00.000Z' })).toBe(
      '2026-11-01T10:00:00.000Z'
    )
  })

  it.each([
    [0, '0:00'],
    [59, '0:59'],
    [2527, '42:07'],
    [3600, '1:00:00'],
    [3725, '1:02:05'],
    [null, '—'],
    [undefined, '—'],
    [-1, '—'],
    [Number.NaN, '—'],
  ])('formats a duration of %s seconds as %s', (seconds, expected) => {
    expect(formatGameDuration(seconds)).toBe(expected)
  })

  it('shows the top score, or a dash while the game is not finished', () => {
    expect(formatGameTopScore(30)).toBe('30')
    expect(formatGameTopScore(0)).toBe('0')
    expect(formatGameTopScore(null)).toBe('—')
    expect(formatGameTopScore(undefined)).toBe('—')
  })

  it('turns a calendar day into [local midnight, next local midnight) bounds', () => {
    const start = getLocalDayBounds('2026-11-05', 'start')
    const end = getLocalDayBounds('2026-11-05', 'end')

    expect(new Date(start!).getTime()).toBe(new Date(2026, 10, 5, 0, 0, 0, 0).getTime())
    expect(new Date(end!).getTime()).toBe(new Date(2026, 10, 6, 0, 0, 0, 0).getTime())
  })

  it('rolls the end bound over the month and the year', () => {
    expect(new Date(getLocalDayBounds('2026-11-30', 'end')!).getTime()).toBe(
      new Date(2026, 11, 1).getTime()
    )
    expect(new Date(getLocalDayBounds('2026-12-31', 'end')!).getTime()).toBe(
      new Date(2027, 0, 1).getTime()
    )
  })

  it.each(['', '05/11/2026', '2026-11-5', 'abc'])('has no bound for the day %j', (day) => {
    expect(getLocalDayBounds(day, 'start')).toBeNull()
  })

  it('shows the email, a masked mention for the staff, or nothing', () => {
    expect(getGamePlayerEmailDisplay({ email: 'a@quizzup.test', hasEmail: true })).toEqual({
      kind: 'value',
      value: 'a@quizzup.test',
    })
    expect(getGamePlayerEmailDisplay({ email: null, hasEmail: true })).toEqual({ kind: 'masked' })
    expect(getGamePlayerEmailDisplay({ email: null, hasEmail: false })).toEqual({ kind: 'none' })
    expect(getGamePlayerEmailDisplay({ email: '  ', hasEmail: false })).toEqual({ kind: 'none' })
  })

  it('formats a date with the locale, dash when missing or invalid', () => {
    expect(formatGameDate('2026-11-03T10:00:00.000Z', 'fr')).toMatch(/03\/11\/2026/)
    expect(formatGameDate(null, 'fr')).toBe('—')
    expect(formatGameDate('not a date', 'fr')).toBe('—')
  })

  it('formats a calendar day without time, as the local day, whatever the locale', () => {
    expect(formatGameDay('2026-11-05', 'fr')).toMatch(/^0?5\/11\/2026$/)
    expect(formatGameDay('2026-11-05', 'en')).toBe('11/5/26')
    expect(formatGameDay('', 'fr')).toBe('')
    expect(formatGameDay('abc', 'fr')).toBe('abc')
  })

  it('normalises the participants count', () => {
    expect(formatGameParticipantsCount(3)).toBe(3)
    expect(formatGameParticipantsCount('2')).toBe(2)
    expect(formatGameParticipantsCount(undefined)).toBe(0)
    expect(formatGameParticipantsCount(-1)).toBe(0)
  })

  it('falls back to the room id without a room name', () => {
    expect(getGameRoomName({ roomId: 10, roomName: 'Salle Néon' })).toBe('Salle Néon')
    expect(getGameRoomName({ roomId: 10, roomName: '  ' })).toBe('#10')
    expect(getGameRoomName({ roomId: 10 })).toBe('#10')
  })
})

function t(key: string, params?: Record<string, string | number>): string {
  return params ? `${key}:${JSON.stringify(params)}` : key
}

describe('getGameMiniGameLabelKey', () => {
  it('points to the games.miniGames i18n namespace', () => {
    expect(getGameMiniGameLabelKey(MINI_GAME_FIRST_BUZZ)).toBe('games.miniGames.first_buzz')
  })

  it('has a French and an English label for every shared mini-game', async () => {
    const [fr, en] = await Promise.all([
      import('@/locales/fr/games.json'),
      import('@/locales/en/games.json'),
    ])

    for (const miniGame of MINI_GAMES) {
      expect(fr.default.games.miniGames[miniGame]).toBeTruthy()
      expect(en.default.games.miniGames[miniGame]).toBeTruthy()
    }
  })
})

describe('utils/game/banner', () => {
  it('reads success messages from games.banners', () => {
    expect(
      getGameBannerMessage(createSuccessBanner(GAME_BANNER_CREATED, { room: 'Salle Néon' }), t)
    ).toBe('games.banners.created:{"room":"Salle Néon"}')
  })

  it('reads error messages from games.errors', () => {
    expect(getGameBannerMessage(createErrorBanner('game_already_over'), t)).toBe(
      'games.errors.gameAlreadyOver'
    )
  })

  it('returns null without banner', () => {
    expect(getGameBannerMessage(null, t)).toBeNull()
  })
})
