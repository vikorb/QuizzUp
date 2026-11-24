import type { Page, Route } from '@playwright/test'

import { API_URL, ROOM_APP_URL } from './urls'

/**
 * API du backoffice simulée (`VITE_API_URL=http://api.quizzup.test`, cf. playwright.config) :
 * mêmes routes et mêmes réponses que le backend Fastify pour la connexion de la salle.
 */

export type FakeAccount = { id: number; companyId: number; role: string; username: string }

export type FakeApi = {
  calls: string[]
  /** Config matérielle enregistrée sur le compte de la salle (`rooms.config`). */
  roomConfig: Record<string, unknown>
  /** Accusés de commande reçus (`POST /room/commands/:id/result`), dans l'ordre. */
  commandResults: { commandId: string; body: Record<string, unknown> }[]
  /**
   * Envoie une commande à la salle par le flux `GET /room/stream` (option `live`). Sans flux
   * ouvert, elle attend la prochaine ouverture : la salle ne la reçoit jamais avant son `hello`.
   */
  sendCommand: (command: Record<string, unknown>) => void
}

/** Partie préparée au backoffice et son contenu (`GET /room/games/current`, `.../content`). */
export type FakeLive = { game: Record<string, unknown> & { id: number }; themes: unknown[] }

/** Un flux sans commande est rendu (avec son seul `hello`) au bout de ce délai. */
const STREAM_HOLD_MS = 20_000

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ROOM_APP_URL,
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
}

const sse = (event: string, data: string) => `event: ${event}\ndata: ${data}\n\n`

function cors(route: Route, status: number, body?: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: CORS_HEADERS,
    body: body === undefined ? '' : JSON.stringify(body),
  })
}

export async function mockBackofficeApi(
  page: Page,
  options: { password: string; account: FakeAccount; live?: FakeLive }
): Promise<FakeApi> {
  const pendingCommands: string[] = []
  let wakeStream: (() => void) | null = null
  let streams = 0
  const api: FakeApi = {
    calls: [],
    roomConfig: {},
    commandResults: [],
    sendCommand: (command) => {
      pendingCommands.push(JSON.stringify(command))
      wakeStream?.()
    },
  }
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
    if (pathname.startsWith('/room/') && request.headers().authorization !== `Bearer ${token}`) {
      return cors(route, 401, { error: 'unauthorized' })
    }
    if (pathname === '/room/me') {
      return cors(route, 200, {
        room: { id: 1, name: 'Salle 1', config: api.roomConfig },
        company: { id: options.account.companyId, name: 'Centre' },
      })
    }
    if (pathname === '/room/config' && request.method() === 'PUT') {
      const body = request.postDataJSON() as { config: Record<string, unknown> }
      api.roomConfig = body.config
      return cors(route, 200, { room: { id: 1, name: 'Salle 1', config: api.roomConfig } })
    }
    if (pathname === '/room/games/current') {
      return cors(route, 200, { game: options.live?.game ?? null })
    }
    if (options.live && pathname === '/room/games/current/content') {
      return cors(route, 200, { themes: options.live.themes })
    }
    if (options.live && pathname === `/room/games/${options.live.game.id}/start`) {
      return cors(route, 200, { game: { ...options.live.game, state: 'running' } })
    }
    if (options.live && pathname === '/room/stream') {
      // Un flux SSE ne se livre pas en morceaux : il est tenu jusqu'à une commande, puis rendu
      // d'un bloc (`hello` puis commandes) ; la salle le rouvre aussitôt.
      if (pendingCommands.length === 0) {
        await new Promise<void>((resolve) => {
          wakeStream = resolve
          setTimeout(resolve, STREAM_HOLD_MS)
        })
        wakeStream = null
      }
      streams += 1
      const hello = { streamId: `stream-${streams}`, heartbeatMs: 15_000, statusEveryMs: 15_000 }
      return route
        .fulfill({
          status: 200,
          contentType: 'text/event-stream',
          headers: CORS_HEADERS,
          body: [
            sse('hello', JSON.stringify(hello)),
            ...pendingCommands.splice(0).map((data) => sse('command', data)),
          ].join(''),
        })
        .catch(() => undefined)
    }
    if (options.live && pathname === '/room/status') {
      return cors(route, 204)
    }
    const result = /^\/room\/commands\/([^/]+)\/result$/.exec(pathname)
    if (options.live && result) {
      api.commandResults.push({
        commandId: result[1] ?? '',
        body: request.postDataJSON() as Record<string, unknown>,
      })
      return cors(route, 204)
    }
    if (pathname === '/logout') {
      return cors(route, 204)
    }
    return cors(route, 404, { error: 'not_found' })
  })

  return api
}
