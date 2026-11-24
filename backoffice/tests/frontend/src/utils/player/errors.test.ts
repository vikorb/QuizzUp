import { describe, expect, it } from 'vitest'

import { getPlayersErrorKey, readPlayersApiError } from '@/utils/player/errors'

describe('utils/player/errors', () => {
  it.each(['player_not_found', 'forbidden', 'invalid_body', 'invalid_params'])(
    'reads the known code %s',
    (code) => {
      expect(readPlayersApiError({ error: code })).toBe(code)
    }
  )

  it.each([null, undefined, {}, { error: 42 }, { error: 'something_else' }, 'forbidden'])(
    'ignores the payload %j',
    (payload) => {
      expect(readPlayersApiError(payload)).toBeNull()
    }
  )

  it('turns a code into its i18n key', () => {
    expect(getPlayersErrorKey('player_not_found')).toBe('players.errors.playerNotFound')
    expect(getPlayersErrorKey('api_unreachable')).toBe('players.errors.apiUnreachable')
  })

  it('shows the server error for an unknown or missing code', () => {
    expect(getPlayersErrorKey('something_else')).toBe('players.errors.serverError')
    expect(getPlayersErrorKey(null)).toBe('players.errors.serverError')
    expect(getPlayersErrorKey(undefined)).toBe('players.errors.serverError')
  })
})
