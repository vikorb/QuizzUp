import { ADMIN_ROLE_ADMIN, ADMIN_ROLE_ROOM } from '@quizzup/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as authStateModule from '@/state/authState'
import type * as authUtilsModule from '@/utils/auth'

// Le setup global mocke authState et utils/auth : on teste ici l'implémentation réelle,
// en ne mockant que le stockage du token et la couche HTTP (fetch).
const authMocks = vi.hoisted(() => ({
  storedToken: null as string | null,
  listeners: [] as Array<() => void>,
  logoutApi: vi.fn(async (_token: string) => undefined),
  unsubscribe: vi.fn(),
}))

vi.mock('@/utils/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof authUtilsModule>()),
  getApiBase: () => 'http://api.test',
  getToken: () => authMocks.storedToken,
  logoutApi: authMocks.logoutApi,
  onAuthChanged: (cb: () => void) => {
    authMocks.listeners.push(cb)
    return authMocks.unsubscribe
  },
  clearToken: () => {
    authMocks.storedToken = null

    for (const listener of authMocks.listeners) {
      listener()
    }
  },
}))

type AuthStateModule = typeof authStateModule

async function loadAuthState(token: string): Promise<AuthStateModule> {
  authMocks.storedToken = token
  vi.resetModules()

  return vi.importActual<AuthStateModule>('@/state/authState')
}

function mockMeResponse(role: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ admin: { id: 9, companyId: 1, role, username: 'salle-neon' } }),
    }))
  )
}

beforeEach(() => {
  authMocks.storedToken = null
  authMocks.listeners = []
  authMocks.logoutApi.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('state/authState.ts', () => {
  it('keeps the session of a backoffice account', async () => {
    mockMeResponse(ADMIN_ROLE_ADMIN)

    const authState = await loadAuthState('admin-token')
    const admin = await authState.refreshMe()

    expect(admin).toMatchObject({ role: ADMIN_ROLE_ADMIN })
    expect(authState.me.value).toMatchObject({ role: ADMIN_ROLE_ADMIN })
    expect(authState.isAuthenticated.value).toBe(true)
    expect(authState.roomAccountRejected.value).toBe(false)
    expect(authMocks.logoutApi).not.toHaveBeenCalled()
  })

  it('signs a room account out as soon as /me returns its role', async () => {
    mockMeResponse(ADMIN_ROLE_ROOM)

    const authState = await loadAuthState('room-token')
    const admin = await authState.refreshMe()

    expect(admin).toBeNull()
    expect(authState.me.value).toBeNull()
    expect(authState.isAuthenticated.value).toBe(false)
    expect(authState.roomAccountRejected.value).toBe(true)
    expect(authMocks.storedToken).toBeNull()
    expect(authMocks.logoutApi).toHaveBeenCalledWith('room-token')

    authState.clearRoomAccountRejection()

    expect(authState.roomAccountRejected.value).toBe(false)
  })
})
