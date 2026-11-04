import type { Page, Route } from '@playwright/test'

/**
 * API du backoffice simulée (`VITE_API_URL=http://api.quizzup.test`, cf. playwright.config) :
 * mêmes routes et mêmes réponses que le backend Fastify pour la connexion de la salle.
 */
export const API_URL = 'http://api.quizzup.test'
const ROOM_ORIGIN = 'http://localhost:4174'

export type FakeAccount = { id: number; companyId: number; role: string; username: string }

export type FakeApi = {
  calls: string[]
}

function cors(route: Route, status: number, body?: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: {
      'Access-Control-Allow-Origin': ROOM_ORIGIN,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
    body: body === undefined ? '' : JSON.stringify(body),
  })
}

export async function mockBackofficeApi(
  page: Page,
  options: { password: string; account: FakeAccount }
): Promise<FakeApi> {
  const api: FakeApi = { calls: [] }
  const token = 'jeton-de-salle'

  await page.route(`${API_URL}/**`, async (route) => {
    const request = route.request()
    const { pathname } = new URL(request.url())
    if (request.method() === 'OPTIONS') {
      return cors(route, 204)
    }
    api.calls.push(`${request.method()} ${pathname}`)

    if (pathname === '/login' && request.method() === 'POST') {
      const body = request.postDataJSON() as { identifier?: string; password?: string }
      if (body.identifier !== options.account.username || body.password !== options.password) {
        return cors(route, 401, { error: 'invalid_credentials' })
      }
      return cors(route, 200, { token })
    }
    if (pathname === '/me') {
      return request.headers().authorization === `Bearer ${token}`
        ? cors(route, 200, { admin: options.account })
        : cors(route, 401, { error: 'unauthorized' })
    }
    if (pathname === '/logout') {
      return cors(route, 204)
    }
    return cors(route, 404, { error: 'not_found' })
  })

  return api
}
