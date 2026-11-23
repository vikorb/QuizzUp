import { afterEach, describe, expect, it, vi } from 'vitest'

import en from '@/locales/en/room.json'
import fr from '@/locales/fr/room.json'
import { apiRequestJson } from '@/utils/api'
import { getRoomApiFormError } from '@/utils/room/form'

// Le setup global moque `@/utils/auth` sans `getApiBase` : on le fournit pour tester le vrai client HTTP.
vi.mock('@/utils/auth', () => ({ getApiBase: () => 'http://api.test' }))

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('smoke_config_forbidden (S1)', () => {
  it('keeps the server code on a 403 instead of the generic forbidden', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'smoke_config_forbidden' }, 403))
    )

    const result = await apiRequestJson({ path: '/companies/1/rooms/1', method: 'PATCH' })

    expect(result).toEqual({ ok: false, status: 403, error: 'smoke_config_forbidden' })
  })

  it('keeps the revision conflict code on a 409', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'room_config_conflict' }, 409))
    )

    const result = await apiRequestJson({ path: '/companies/1/rooms/1', method: 'PATCH' })

    expect(result).toEqual({ ok: false, status: 409, error: 'room_config_conflict' })
  })

  it.each([
    ['fr', fr],
    ['en', en],
  ])('has a %s message shown by the room form', (_locale, messages) => {
    const errors = messages.rooms.form.errors as Record<string, string>
    const t = (key: string) => {
      const code = key.replace('rooms.form.errors.', '')

      return errors[code] ?? key
    }

    for (const code of ['smoke_config_forbidden', 'room_config_conflict']) {
      expect(errors[code]).toBeTruthy()
      expect(getRoomApiFormError(code, t)).toBe(errors[code])
    }
  })
})
