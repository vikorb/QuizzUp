import { beforeEach } from 'vitest'

import { resetDb } from './mockDb'
import { resetSecurityMocks } from './mockSecurity'
import { jwtSignMock } from './testApp'

export function resetRouteMocksBeforeEach(): void {
  beforeEach(() => {
    resetDb()
    resetSecurityMocks()
    jwtSignMock.mockClear()
  })
}
