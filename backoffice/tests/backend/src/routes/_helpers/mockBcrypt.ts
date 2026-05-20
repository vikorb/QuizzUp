import { vi } from 'vitest'

export const bcryptCompareMock = vi.fn(async (_password: string, _hash: string): Promise<boolean> => true)
export const bcryptHashMock = vi.fn(async (password: string, _saltRounds: number): Promise<string> => `hashed:${password}`)

export function resetBcryptMocks(): void {
  bcryptCompareMock.mockReset()
  bcryptHashMock.mockReset()

  bcryptCompareMock.mockResolvedValue(true)
  bcryptHashMock.mockImplementation(async (password) => `hashed:${password}`)
}
