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

export const isAuthenticatedMock = ref(false)
export const meMock = ref<MeMock | null>(null)

export const logoutMock = vi.fn()
export const loginMock = vi.fn()
export const refreshMeMock = vi.fn(async () => undefined)

export function resetAuthStateMock(): void {
  isAuthenticatedMock.value = false
  meMock.value = null
  logoutMock.mockReset()
  loginMock.mockReset()
  refreshMeMock.mockReset()
  refreshMeMock.mockResolvedValue(undefined)
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
