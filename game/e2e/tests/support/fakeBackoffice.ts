import type { Page, Route } from '@playwright/test'

import { API_URL, BACKOFFICE_URL } from './urls'

/**
 * API du backoffice simulée pour le frontend du backoffice (`VITE_API_URL=http://api.quizzup.test`,
 * cf. playwright.config) : la page publique d'inscription et la feuille de résultats imprimable.
 * Mêmes routes et mêmes réponses que le backend (cf. `backoffice/docs/api/openapi.yaml`). Celle de
 * l'écran de salle est dans `fakeApi.ts` (autre origine, donc autres en-têtes CORS).
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': BACKOFFICE_URL,
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function reply(route: Route, status: number, body?: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: CORS_HEADERS,
    body: body === undefined ? '' : JSON.stringify(body),
  })
}

/** Réponse de `POST /public/v1/join/lookup` (`PublicJoinLink`). */
export const JOIN_LINK = {
  companyName: 'Centre Démo',
  roomName: 'Salle 1',
  logoUrl: null,
  expiresAt: '2026-11-04T23:00:00.000Z',
  kidsMode: false,
}

export type JoinRegistration = { token: string; displayName: string; [field: string]: unknown }

export type FakeJoinApi = {
  /** Nombre de requêtes reçues, préliminaires CORS (`OPTIONS`) exclus. */
  requests: number
  /** Corps des demandes reçues (`POST /public/v1/join/registrations`), dans l'ordre. */
  registrations: JoinRegistration[]
}

/**
 * Routes publiques d'inscription. Un jeton autre que `token` est inconnu (404 `join_link_invalid`) ;
 * `closed` ferme le lien (410 `join_link_closed`) ; `full` refuse la demande (409 `join_full`).
 * `onRegistration` est appelé pour chaque demande acceptée : le test y pousse l'effet côté salle.
 */
export async function mockJoinApi(
  page: Page,
  options: {
    token: string
    closed?: boolean
    full?: boolean
    onRegistration?: (registration: JoinRegistration) => void
  }
): Promise<FakeJoinApi> {
  const api: FakeJoinApi = { requests: 0, registrations: [] }

  await page.route(`${API_URL}/public/v1/join/*`, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') {
      return reply(route, 204)
    }
    api.requests += 1
    const body = request.postDataJSON() as JoinRegistration
    if (body.token !== options.token) {
      return reply(route, 404, { error: 'join_link_invalid' })
    }
    if (options.closed) {
      return reply(route, 410, { error: 'join_link_closed' })
    }
    if (new URL(request.url()).pathname.endsWith('/lookup')) {
      return reply(route, 200, JOIN_LINK)
    }
    if (options.full) {
      return reply(route, 409, { error: 'join_full' })
    }
    api.registrations.push(body)
    options.onRegistration?.(body)
    return reply(route, 201, { ok: true })
  })

  return api
}

const COMPANY = { id: 3, name: 'Centre Démo' }

/**
 * Routes de la feuille de résultats d'une partie : compte connecté (jeton posé avant le chargement),
 * détail de la partie, fiche de la compagnie et bons.
 */
export async function mockResultsApi(
  page: Page,
  options: { game: Record<string, unknown> & { id: number }; vouchers: unknown[] }
): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('quizzup_token', 'jeton-du-staff'))

  await page.route(`${API_URL}/**`, async (route) => {
    const request = route.request()
    const { pathname } = new URL(request.url())
    if (request.method() === 'OPTIONS') {
      return reply(route, 204)
    }
    if (request.headers().authorization !== 'Bearer jeton-du-staff') {
      return reply(route, 401, { error: 'unauthorized' })
    }
    if (pathname === '/me') {
      return reply(route, 200, {
        admin: { id: 1, companyId: COMPANY.id, role: 'admin', username: 'admin-demo' },
      })
    }
    if (pathname === `/companies/${COMPANY.id}`) {
      return reply(route, 200, { company: COMPANY })
    }
    if (pathname === `/companies/${COMPANY.id}/games/${options.game.id}`) {
      return reply(route, 200, { game: options.game })
    }
    if (pathname === `/companies/${COMPANY.id}/games/${options.game.id}/vouchers`) {
      return reply(route, 200, { vouchers: options.vouchers })
    }
    return reply(route, 404, { error: 'not_found' })
  })
}
