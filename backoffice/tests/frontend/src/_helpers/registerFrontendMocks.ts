import { vi } from 'vitest'

// plugins/i18n lit localStorage au chargement du module (i18n.ts). Sous Node 25, le
// localStorage global expérimental masque celui de jsdom et casse à l'import (getItem non
// appelable). On mocke le plugin : seul LanguageSwitcher (navbar) l'importe statiquement,
// les autres composants passent par le mock vue-i18n de la config vitest.
vi.mock('@/plugins/i18n', () => ({
  getCurrentLocale: () => 'fr',
  setCurrentLocale: () => {},
  createAppI18n: () => ({ install: () => {} }),
  i18n: { global: { locale: { value: 'fr' } } },
}))

vi.mock('@/composables/useConfirm', async () => {
  const confirm = await import('./confirmMock')

  return {
    useConfirm: confirm.useConfirmMock,
  }
})

// Les vues ne doivent pas ouvrir de flux : les tests pilotent la présence via liveCompanyMock.
// Le vrai composable se teste avec `vi.importActual` (voir useLiveCompany.test.ts).
vi.mock('@/composables/useLiveCompany', async () => {
  const liveCompany = await import('./liveCompanyMock')

  return {
    useLiveCompany: liveCompany.useLiveCompanyMock,
  }
})

vi.mock('@/state/authState', async () => {
  const authState = await import('./authStateMock')

  return {
    authState: authState.authStateMock,
    isAuthenticated: authState.isAuthenticatedMock,
    me: authState.meMock,
    roomAccountRejected: authState.roomAccountRejectedMock,
    login: authState.loginMock,
    logout: authState.logoutMock,
    refreshMe: authState.refreshMeMock,
    clearRoomAccountRejection: authState.clearRoomAccountRejectionMock,
  }
})

vi.mock('@/utils/auth', async () => {
  const authApi = await import('./authApiMock')

  return {
    loginApi: authApi.loginApiMock,
    loginTotpApi: authApi.loginTotpApiMock,
    startTotpEnrollApi: authApi.startTotpEnrollApiMock,
    confirmTotpEnrollApi: authApi.confirmTotpEnrollApiMock,
    resetTotpApi: authApi.resetTotpApiMock,
    loginReasonToI18nKey: authApi.loginReasonToI18nKeyMock,
    setToken: authApi.setTokenMock,
    getApiBase: () => 'http://api.test',
  }
})

vi.mock('@/utils/router', async () => {
  const routerUtils = await import('./routerUtilsMock')

  return {
    getRedirect: routerUtils.getRedirectMock,
  }
})

vi.mock('@/utils/company/details/form', async () => {
  const companyDetailForm = await import('./companyDetailFormMock')

  return companyDetailForm.companyDetailFormModuleMock
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

vi.mock('@/services/roomsService', async () => {
  const roomsService = await import('./roomsServiceMock')

  return {
    loadCompanyRoomsService: roomsService.loadCompanyRoomsServiceMock,
    loadCompanyRoomService: roomsService.loadCompanyRoomServiceMock,
    createCompanyRoomService: roomsService.createCompanyRoomServiceMock,
    updateCompanyRoomService: roomsService.updateCompanyRoomServiceMock,
    updateRoomStatusService: roomsService.updateRoomStatusServiceMock,
    deleteRoomService: roomsService.deleteRoomServiceMock,
    updateRoomScheduleService: roomsService.updateRoomScheduleServiceMock,
    loadRoomAccountService: roomsService.loadRoomAccountServiceMock,
    createRoomAccountService: roomsService.createRoomAccountServiceMock,
    deleteRoomAccountService: roomsService.deleteRoomAccountServiceMock,
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

vi.mock('@/services/companyLogoService', async () => {
  const companyLogoService = await import('./companyLogoServiceMock')

  return {
    uploadCompanyLogoService: companyLogoService.uploadCompanyLogoServiceMock,
    deleteCompanyLogoService: companyLogoService.deleteCompanyLogoServiceMock,
  }
})

vi.mock('@/services/themesService', async () => {
  const themesService = await import('./themesServiceMock')

  return {
    listThemesService: themesService.listThemesServiceMock,
    loadThemeService: themesService.loadThemeServiceMock,
    createThemeService: themesService.createThemeServiceMock,
    updateThemeService: themesService.updateThemeServiceMock,
    updateThemeStatusService: themesService.updateThemeStatusServiceMock,
    deleteThemeService: themesService.deleteThemeServiceMock,
  }
})

vi.mock('@/services/questionsService', async () => {
  const questionsService = await import('./questionsServiceMock')

  return {
    listThemesService: questionsService.listThemesServiceMock,
    listQuestionsService: questionsService.listQuestionsServiceMock,
    loadQuestionService: questionsService.loadQuestionServiceMock,
    createQuestionService: questionsService.createQuestionServiceMock,
    updateQuestionService: questionsService.updateQuestionServiceMock,
    deleteQuestionService: questionsService.deleteQuestionServiceMock,
    listQuestionThemesService: questionsService.listQuestionThemesServiceMock,
    listQuestionAnswersService: questionsService.listQuestionAnswersServiceMock,
    createQuestionAnswerService: questionsService.createQuestionAnswerServiceMock,
    updateQuestionAnswerService: questionsService.updateQuestionAnswerServiceMock,
    deleteQuestionAnswerService: questionsService.deleteQuestionAnswerServiceMock,
    updateQuestionStatusService: questionsService.updateQuestionStatusServiceMock,
    attachQuestionToThemeService: questionsService.attachQuestionToThemeServiceMock,
    detachQuestionFromThemeService: questionsService.detachQuestionFromThemeServiceMock,
  }
})

vi.mock('@/services/questionImportService', async () => {
  const questionImportService = await import('./questionImportServiceMock')

  return {
    importQuestionsService: questionImportService.importQuestionsServiceMock,
  }
})

vi.mock('@/services/questionMediaService', async () => {
  const questionMediaService = await import('./questionMediaServiceMock')

  return {
    uploadQuestionMediaService: questionMediaService.uploadQuestionMediaServiceMock,
    deleteQuestionMediaService: questionMediaService.deleteQuestionMediaServiceMock,
    fetchQuestionMediaBlobService: questionMediaService.fetchQuestionMediaBlobServiceMock,
  }
})
