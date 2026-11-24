import type {
  DeleteDemoRequestResult,
  DemoRequest,
  DemoRequestsResponse,
} from '@/types/demoRequest'
import { apiFetch, apiRequestJson } from '@/utils/api'

export function loadDemoRequestsService() {
  return apiRequestJson<DemoRequestsResponse>({
    path: '/demo-requests',
    method: 'GET',
    authenticated: true,
  })
}

export function updateDemoRequestService(demoRequestId: number, processed: boolean) {
  return apiRequestJson<{ demoRequest: DemoRequest }>({
    path: `/demo-requests/${demoRequestId}`,
    method: 'PATCH',
    authenticated: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ processed }),
  })
}

// Le serveur répond 204 sans corps : `apiRequestJson` y verrait un JSON invalide.
export async function deleteDemoRequestService(
  demoRequestId: number
): Promise<DeleteDemoRequestResult> {
  const response = await apiFetch({
    path: `/demo-requests/${demoRequestId}`,
    method: 'DELETE',
    authenticated: true,
  })

  if (!response) {
    return { ok: false, error: 'api_unreachable' }
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: unknown } | null

    return { ok: false, error: typeof payload?.error === 'string' ? payload.error : 'server_error' }
  }

  return { ok: true }
}
