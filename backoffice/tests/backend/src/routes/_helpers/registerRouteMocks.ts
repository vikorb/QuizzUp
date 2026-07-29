import './registerDbMock'

import { vi } from 'vitest'

vi.mock('../../../../../backend/src/security/requireApiPermission', async () => {
  const { requireApiPermissionMock } = await import('./mockSecurity')

  return {
    requireApiPermission: requireApiPermissionMock,
  }
})

vi.mock('../../../../../backend/src/security/companiesPolicy', async () => {
  const { companiesPolicyMock } = await import('./mockSecurity')

  return companiesPolicyMock
})
