import { beforeEach } from 'vitest'

import { resetAuthApiMock } from './authApiMock'
import { resetAuthStateMock } from './authStateMock'
import { resetRouterMock } from './routerMock'
import { resetRouterUtilsMock } from './routerUtilsMock'

export function resetFrontendMocksBeforeEach(): void {
  beforeEach(() => {
    resetAuthStateMock()
    resetAuthApiMock()
    resetRouterMock()
    resetRouterUtilsMock()
  })
}
