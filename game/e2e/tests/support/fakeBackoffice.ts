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
const STAFF_ACCOUNT = { id: 1, companyId: COMPANY.id, role: 'admin', username: 'admin-demo' }

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
      return reply(route, 200, { admin: STAFF_ACCOUNT })
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

/** Salle suivie par le panneau « Suivi en direct » (`RoomLive` de `@quizzup/shared`). */
export type FakeLiveRoom = { roomId: number; [field: string]: unknown }

export type FakeLiveApi = {
  /** Commandes reçues (`POST /companies/:id/rooms/:roomId/commands`), dans l'ordre. */
  commands: {
    path: string
    body: { commandId: string; command: string; [field: string]: unknown }
  }[]
  /** Pousse un événement sur le flux du personnel, resté ouvert (`GET /companies/:id/live`). */
  push: (event: string, data: unknown) => Promise<void>
}

type LiveStreamWindow = { __liveStream: { push: (text: string) => void } }

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

/**
 * Fiche d'une partie en cours et son suivi en direct, vus par le personnel connecté. Le flux
 * `GET /companies/:id/live` ne passe pas par `page.route` (qui rend la réponse d'un bloc puis la
 * ferme, ce qui couperait le suivi et bloquerait les boutons) : `fetch` est remplacé dans la page
 * par un flux qui reste ouvert, alimenté par `push`. Il s'ouvre sur l'instantané de `room`.
 * `commandReply` : réponse de la route d'envoi (`202` par défaut).
 */
export async function mockLiveGameApi(
  page: Page,
  options: {
    game: Record<string, unknown> & { id: number }
    room: FakeLiveRoom
    commandReply?: { status: number; body: unknown }
  }
): Promise<FakeLiveApi> {
  const api: FakeLiveApi = {
    commands: [],
    push: (event, data) =>
      page.evaluate(
        (text) => (window as unknown as LiveStreamWindow).__liveStream.push(text),
        sse(event, data)
      ),
  }
  const commandsPath = `/companies/${COMPANY.id}/rooms/${options.room.roomId}/commands`

  await page.addInitScript(
    ({ liveUrl, snapshot }) => {
      localStorage.setItem('quizzup_token', 'jeton-du-staff')
      const encoder = new TextEncoder()
      let stream: ReadableStreamDefaultController<Uint8Array> | null = null
      const realFetch = window.fetch.bind(window)
      window.fetch = (input, init) => {
        const url = input instanceof Request ? input.url : String(input)
        if (url !== liveUrl) {
          return realFetch(input, init)
        }
        // Comme le vrai serveur : pas de flux sans le jeton du personnel.
        const headers = new Headers(input instanceof Request ? input.headers : init?.headers)
        if (headers.get('authorization') !== 'Bearer jeton-du-staff') {
          return Promise.resolve(new Response(null, { status: 401 }))
        }
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            stream = controller
            controller.enqueue(encoder.encode(snapshot))
          },
        })
        return Promise.resolve(
          new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
        )
      }
      Object.defineProperty(window, '__liveStream', {
        value: { push: (text: string) => stream?.enqueue(encoder.encode(text)) },
      })
    },
    {
      liveUrl: `${API_URL}/companies/${COMPANY.id}/live`,
      snapshot: sse('snapshot', { rooms: [options.room] }),
    }
  )

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
      return reply(route, 200, { admin: STAFF_ACCOUNT })
    }
    if (pathname === `/companies/${COMPANY.id}`) {
      return reply(route, 200, { company: COMPANY })
    }
    if (pathname === `/companies/${COMPANY.id}/games/${options.game.id}`) {
      return reply(route, 200, { game: options.game })
    }
    if (pathname === `/companies/${COMPANY.id}/games/${options.game.id}/vouchers`) {
      return reply(route, 200, { vouchers: [] })
    }
    if (pathname === commandsPath && request.method() === 'POST') {
      const body = request.postDataJSON() as FakeLiveApi['commands'][number]['body']
      api.commands.push({ path: pathname, body })
      const { status, body: payload } = options.commandReply ?? {
        status: 202,
        body: { commandId: body.commandId },
      }
      return reply(route, status, payload)
    }
    return reply(route, 404, { error: 'not_found' })
  })

  return api
}
