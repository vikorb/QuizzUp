import { apiFetch } from '@/utils/api'

/** Codes renvoyés par l'API du logo, ou déduits du statut HTTP (413). */
export type CompanyLogoErrorCode =
  | 'logo_type_invalid'
  | 'logo_too_large'
  | 'forbidden'
  | 'not_found'
  | 'unauthorized'
  | 'api_unreachable'
  | 'server_error'

export type CompanyLogoResult<T> =
  { ok: true; data: T } | { ok: false; error: CompanyLogoErrorCode }

const KNOWN_ERROR_CODES: CompanyLogoErrorCode[] = [
  'logo_type_invalid',
  'logo_too_large',
  'forbidden',
  'not_found',
  'unauthorized',
]

async function readLogoError(response: Response | null): Promise<CompanyLogoErrorCode> {
  if (!response) {
    return 'api_unreachable'
  }

  if (response.status === 413) {
    return 'logo_too_large'
  }

  const data = (await response.json().catch(() => null)) as { error?: unknown } | null
  const code = data?.error

  if (typeof code === 'string' && KNOWN_ERROR_CODES.includes(code as CompanyLogoErrorCode)) {
    return code as CompanyLogoErrorCode
  }

  return response.status === 403 ? 'forbidden' : 'server_error'
}

/** Envoie le fichier brut (pas de multipart) ; le serveur vérifie le type sur les octets. */
export async function uploadCompanyLogoService(
  companyId: number,
  file: File
): Promise<CompanyLogoResult<{ logoUrl: string }>> {
  const response = await apiFetch({
    path: `/companies/${companyId}/logo`,
    method: 'PUT',
    authenticated: true,
    headers: { 'Content-Type': file.type },
    body: file,
  })

  if (!response?.ok) {
    return { ok: false, error: await readLogoError(response) }
  }

  const data = (await response.json().catch(() => null)) as { logoUrl?: unknown } | null

  return typeof data?.logoUrl === 'string'
    ? { ok: true, data: { logoUrl: data.logoUrl } }
    : { ok: false, error: 'server_error' }
}

export async function deleteCompanyLogoService(
  companyId: number
): Promise<CompanyLogoResult<null>> {
  const response = await apiFetch({
    path: `/companies/${companyId}/logo`,
    method: 'DELETE',
    authenticated: true,
  })

  return response?.ok
    ? { ok: true, data: null }
    : { ok: false, error: await readLogoError(response) }
}
