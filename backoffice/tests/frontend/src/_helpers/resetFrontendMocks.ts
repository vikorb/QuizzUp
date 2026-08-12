import { beforeEach } from 'vitest'

import { resetAccountsServiceMock } from './accountsServiceMock'
import { resetAuthApiMock } from './authApiMock'
import { resetAuthStateMock } from './authStateMock'
import { resetCompaniesServiceMock } from './companiesServiceMock'
import { resetCompanyDetailFormMock } from './companyDetailFormMock'
import { resetConfirmMock } from './confirmMock'
import { resetQuestionsServiceMock } from './questionsServiceMock'
import { resetRouterMock } from './routerMock'
import { resetRouterUtilsMock } from './routerUtilsMock'
import { resetThemesServiceMock } from './themesServiceMock'

export function resetFrontendMocksBeforeEach(): void {
  beforeEach(() => {
    resetAuthStateMock()
    resetAuthApiMock()
    resetConfirmMock()
    resetAccountsServiceMock()
    resetCompaniesServiceMock()
    resetCompanyDetailFormMock()
    resetThemesServiceMock()
    resetQuestionsServiceMock()
    resetRouterMock()
    resetRouterUtilsMock()
  })
}
