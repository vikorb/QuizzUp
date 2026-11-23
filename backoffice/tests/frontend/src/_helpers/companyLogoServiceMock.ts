import { vi } from 'vitest'

import type { CompanyLogoResult } from '@/services/companyLogoService'

export const LOGO_URL = '/public/v1/logos/11111111-1111-4111-8111-111111111111.png'

export const uploadCompanyLogoServiceMock = vi.fn(
  async (): Promise<CompanyLogoResult<{ logoUrl: string }>> => ({
    ok: true,
    data: { logoUrl: LOGO_URL },
  })
)

export const deleteCompanyLogoServiceMock = vi.fn(async (): Promise<CompanyLogoResult<null>> => ({
  ok: true,
  data: null,
}))

export function resetCompanyLogoServiceMock(): void {
  uploadCompanyLogoServiceMock.mockReset()
  deleteCompanyLogoServiceMock.mockReset()

  uploadCompanyLogoServiceMock.mockImplementation(async () => ({
    ok: true,
    data: { logoUrl: LOGO_URL },
  }))
  deleteCompanyLogoServiceMock.mockImplementation(async () => ({ ok: true, data: null }))
}
