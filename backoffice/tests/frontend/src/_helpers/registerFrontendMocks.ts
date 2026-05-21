import { vi } from 'vitest'

vi.mock('@/state/authState', async () => {
  const authState = await import('./authStateMock')

  return {
    isAuthenticated: authState.isAuthenticatedMock,
    me: authState.meMock,
    login: authState.loginMock,
    logout: authState.logoutMock,
    refreshMe: authState.refreshMeMock,
  }
})

vi.mock('@/utils/auth', async () => {
  const authApi = await import('./authApiMock')

  return {
    loginApi: authApi.loginApiMock,
    loginReasonToI18nKey: authApi.loginReasonToI18nKeyMock,
    setToken: authApi.setTokenMock,
  }
})

vi.mock('@/utils/router', async () => {
  const routerUtils = await import('./routerUtilsMock')

  return {
    getRedirect: routerUtils.getRedirectMock,
  }
})

vi.mock('@/services/accountsService', async () => {
  const accountsService = await import('./accountsServiceMock')

  return {
    loadCompanyAccountsService: accountsService.loadCompanyAccountsServiceMock,
    loadCompanyAccountService: accountsService.loadCompanyAccountServiceMock,
    createCompanyAccountService: accountsService.createCompanyAccountServiceMock,
    updateCompanyAccountService: accountsService.updateCompanyAccountServiceMock,
    updateAccountStatusService: accountsService.updateAccountStatusServiceMock,
    deleteAccountService: accountsService.deleteAccountServiceMock,
  }
})

vi.mock('@/services/companiesService', async () => {
  const companiesService = await import('./companiesServiceMock')

  return {
    loadCompaniesService: companiesService.loadCompaniesServiceMock,
    loadCompanyDetailsService: companiesService.loadCompanyDetailsServiceMock,
    createCompany: companiesService.createCompanyMock,
    updateCompanyStatusService: companiesService.updateCompanyStatusServiceMock,
    deleteCompanyPermanentlyService: companiesService.deleteCompanyPermanentlyServiceMock,
  }
})
