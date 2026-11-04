import {
  ADMIN_ROLE_ADMIN,
  ADMIN_ROLE_SUPERADMIN,
  ADMIN_ROLE_USER,
  type AdminRole,
} from '@quizzup/shared'
import { vi } from 'vitest'
import { ref } from 'vue'

export type MeMock = {
  id: number
  companyId: number | null
  role: AdminRole
  username: string
  email: string
}

export const tokenMock = ref<string | null>(null)
export const isAuthenticatedMock = ref(false)
export const meMock = ref<MeMock | null>(null)
export const roomAccountRejectedMock = ref(false)

export const logoutMock = vi.fn()
export const loginMock = vi.fn()
export const syncMock = vi.fn()
export const refreshMeMock = vi.fn(async () => undefined)
export const clearRoomAccountRejectionMock = vi.fn(() => {
  roomAccountRejectedMock.value = false
})

// Objet `authState` importé tel quel par certaines vues (ThemesView, QuestionsView…).
// Il réutilise les mêmes refs réactives que les exports nommés.
export const authStateMock = {
  token: tokenMock,
  isAuthenticated: isAuthenticatedMock,
  me: meMock,
  roomAccountRejected: roomAccountRejectedMock,
  sync: syncMock,
  refreshMe: refreshMeMock,
  logout: logoutMock,
  clearRoomAccountRejection: clearRoomAccountRejectionMock,
}

export function resetAuthStateMock(): void {
  isAuthenticatedMock.value = false
  meMock.value = null
  roomAccountRejectedMock.value = false
  logoutMock.mockReset()
  loginMock.mockReset()
  refreshMeMock.mockReset()
  refreshMeMock.mockResolvedValue(undefined)
  clearRoomAccountRejectionMock.mockClear()
}

/** Simule un /me qui renvoie un compte de salle : authState ferme la session (US-ROOM-02). */
export function mockRefreshMeRejectsRoomAccount(): void {
  refreshMeMock.mockImplementation(async () => {
    roomAccountRejectedMock.value = true
    isAuthenticatedMock.value = false
    meMock.value = null
    return undefined
  })
}

export function setUnauthenticated(): void {
  isAuthenticatedMock.value = false
  meMock.value = null
}

export function setAuthenticatedUser(overrides: Partial<MeMock> = {}): MeMock {
  const user: MeMock = {
    id: 3,
    companyId: 1,
    role: ADMIN_ROLE_USER,
    username: 'bob',
    email: 'bob@quizzup.test',
    ...overrides,
  }

  isAuthenticatedMock.value = true
  meMock.value = user

  return user
}

export function setAuthenticatedAdmin(overrides: Partial<MeMock> = {}): MeMock {
  return setAuthenticatedUser({
    id: 2,
    companyId: 1,
    role: ADMIN_ROLE_ADMIN,
    username: 'alice',
    email: 'alice@quizzup.test',
    ...overrides,
  })
}

export function setAuthenticatedSuperadmin(overrides: Partial<MeMock> = {}): MeMock {
  return setAuthenticatedUser({
    id: 1,
    companyId: 1,
    role: ADMIN_ROLE_SUPERADMIN,
    username: 'root',
    email: 'root@quizzup.test',
    ...overrides,
  })
}
