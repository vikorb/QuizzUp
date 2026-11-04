import { createGameFixture, gamesFixture } from '@frontend-tests/_helpers/gamesServiceMock'
import {
  ADMIN_ROLE_ADMIN,
  ADMIN_ROLE_SUPERADMIN,
  ADMIN_ROLE_USER,
  GAME_STATE_ABORTED,
  GAME_STATE_FINISHED,
  GAME_STATE_PENDING,
  GAME_STATE_RUNNING,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import { createErrorBanner, createSuccessBanner } from '@/utils/banner'
import { GAME_BANNER_CREATED, getGameBannerMessage } from '@/utils/game/banner'
import { parseGameId, resolveGameCompanyId } from '@/utils/game/company'
import { getGameErrorKey, isGameApiErrorCode, readGameApiError } from '@/utils/game/errors'
import { formatGameDate, formatGameParticipantsCount, getGameRoomName } from '@/utils/game/format'
import {
  canAbortGame,
  countGamesByState,
  filterGamesByState,
  getGameStateLabelKey,
  getGameStateTone,
  isGameState,
  updateGameInList,
} from '@/utils/game/state'

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
  })

  it('filters and counts games by state', () => {
    expect(filterGamesByState(gamesFixture, '')).toHaveLength(gamesFixture.length)
    expect(filterGamesByState(gamesFixture, GAME_STATE_RUNNING).map((game) => game.id)).toEqual([3])
    expect(countGamesByState(gamesFixture, GAME_STATE_FINISHED)).toBe(1)
  })

  it('merges an updated game into the list and keeps its participants count', () => {
    const updated = updateGameInList(gamesFixture, {
      ...createGameFixture({ id: 4, state: GAME_STATE_ABORTED }),
      participantsCount: undefined,
    })

    expect(updated.find((game) => game.id === 4)?.state).toBe(GAME_STATE_ABORTED)
    expect(updated.find((game) => game.id === 4)?.participantsCount).toBe(2)
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

  it('builds camelCase i18n keys, server error by default', () => {
    expect(getGameErrorKey('room_busy')).toBe('games.errors.roomBusy')
    expect(getGameErrorKey('email_consent_required')).toBe('games.errors.emailConsentRequired')
    expect(getGameErrorKey('nope')).toBe('games.errors.serverError')
    expect(getGameErrorKey(null)).toBe('games.errors.serverError')
  })
})

describe('utils/game/format', () => {
  it('formats a date with the locale, dash when missing or invalid', () => {
    expect(formatGameDate('2026-11-03T10:00:00.000Z', 'fr')).toMatch(/03\/11\/2026/)
    expect(formatGameDate(null, 'fr')).toBe('—')
    expect(formatGameDate('not a date', 'fr')).toBe('—')
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
