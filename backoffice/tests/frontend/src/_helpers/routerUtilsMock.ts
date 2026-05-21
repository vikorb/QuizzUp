import { vi } from 'vitest'

export const getRedirectMock = vi.fn((_route: unknown, fallback: string) => fallback)

export function resetRouterUtilsMock(): void {
  getRedirectMock.mockReset()
  getRedirectMock.mockImplementation((_route: unknown, fallback: string) => fallback)
}
