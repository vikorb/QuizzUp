import type { CompanySwitchStatus, DeleteCompanyResponse, DeleteCompanyResult, LoadCompaniesResult, UpdateCompanyStatusResponse, UpdateCompanyStatusResult } from '@/types/company'
import { apiRequestJson } from '@/utils/api'
import { parseCompaniesResponse } from '@/utils/company/parser'

export async function loadCompaniesService(): Promise<LoadCompaniesResult> {
  const result = await apiRequestJson<unknown>({
    path: '/companies',
    method: 'GET',
    authenticated: true,
  })

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
    }
  }

  const parsed = parseCompaniesResponse(result.data)

  return {
    ok: true,
    companies: parsed?.companies ?? [],
  }
}


export async function deleteCompanyPermanentlyService(
  companyId: number,
): Promise<DeleteCompanyResult> {
  const result = await apiRequestJson<DeleteCompanyResponse>({
    path: `/companies/${companyId}/permanent`,
    method: 'DELETE',
    authenticated: true,
  })

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
    }
  }

  return {
    ok: true,
    data: result.data,
  }
}


export async function updateCompanyStatusService(
  companyId: number,
  status: CompanySwitchStatus,
): Promise<UpdateCompanyStatusResult> {
  const result = await apiRequestJson<UpdateCompanyStatusResponse>({
    path: `/companies/${companyId}/status`,
    method: 'PATCH',
    authenticated: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      status,
    }),
  })

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
    }
  }

  return {
    ok: true,
    company: result.data.company,
  }
}
