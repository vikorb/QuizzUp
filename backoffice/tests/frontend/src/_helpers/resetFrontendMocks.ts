import { beforeEach } from 'vitest'

import { resetAccountsServiceMock } from './accountsServiceMock'
import { resetAuthApiMock } from './authApiMock'
import { resetAuthStateMock } from './authStateMock'
import { resetCompaniesServiceMock } from './companiesServiceMock'
import { resetRouterMock } from './routerMock'
import { resetRouterUtilsMock } from './routerUtilsMock'

export function resetFrontendMocksBeforeEach(): void {
  beforeEach(() => {
    resetAuthStateMock()
    resetAuthApiMock()
    resetAccountsServiceMock()
    resetCompaniesServiceMock()
    resetRouterMock()
    resetRouterUtilsMock()
  })
}
