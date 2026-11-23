import '../_helpers/registerDbMock'

import fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEMO_REQUEST_MESSAGE_MAX, DEMO_REQUEST_ROOMS_MAX } from '@quizzup/shared'
import publicRoutes from '@backend/routes/public'
import { PUBLIC_API_PREFIX } from '@backend/routes/public/_shared'
import {
  DEMO_REQUEST_BODY_LIMIT,
  DEMO_REQUEST_RATE_LIMIT_MAX,
} from '@backend/routes/public/demoRequests'
import { dbState, MOCK_NOW, resetDb } from '../_helpers/mockDb'

const ENDPOINT = `${PUBLIC_API_PREFIX}/demo-requests`
const WITNESS_EMAIL = 'temoin-4f9c2e@example.com'

const validBody = {
  name: 'Camille Martin',
  centerName: 'Escape Test',
  email: 'camille@example.com',
  phone: '+33 1 23 45 67 89',
  roomsCount: 3,
  message: 'Bonjour, nous aimerions une démonstration.',
  consent: true,
  website: '',
  locale: 'fr',
}

async function createApp(logs?: string[]) {
  const app = fastify({
    logger: logs ? { level: 'info', stream: { write: (line: string) => logs.push(line) } } : false,
  })

  // Le projet de tests ne charge pas les augmentations de types (jwt, authenticate) du backend.
  await app.register(publicRoutes as never, { prefix: PUBLIC_API_PREFIX })
  await app.ready()

  return app
}

type App = Awaited<ReturnType<typeof createApp>>

const send = (app: App, body: unknown, remoteAddress = '203.0.113.10') =>
  app.inject({
    method: 'POST',
    url: ENDPOINT,
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify(body),
    remoteAddress,
  })

describe('routes/public/demoRequests — POST /public/v1/demo-requests', () => {
  beforeEach(() => {
    resetDb()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('answers 202 { ok: true } and stores one row, without any authentication', async () => {
    const app = await createApp()

    const response = await send(app, validBody)

    expect(response.statusCode).toBe(202)
    expect(response.json()).toEqual({ ok: true })
    expect(response.headers['cache-control']).toBe('no-store')
    expect(dbState.demo_requests).toHaveLength(1)
    expect(dbState.demo_requests[0]).toMatchObject({
      contact_name: 'Camille Martin',
      center_name: 'Escape Test',
      email: 'camille@example.com',
      phone: '+33 1 23 45 67 89',
      rooms_count: 3,
      message: 'Bonjour, nous aimerions une démonstration.',
      locale: 'fr',
      consent_at: MOCK_NOW,
    })
    // Rien d'autre que les champs du contrat : ni le champ piège, ni l'adresse, ni le consentement brut.
    expect(Object.keys(dbState.demo_requests[0]!).sort()).toEqual(
      [
        'center_name',
        'consent_at',
        'contact_name',
        'created_at',
        'email',
        'id',
        'locale',
        'message',
        'phone',
        'rooms_count',
        'updated_at',
      ].sort()
    )

    await app.close()
  })

  it('stores null for the optional fields left out', async () => {
    const app = await createApp()

    const response = await send(app, {
      name: 'Camille Martin',
      centerName: 'Escape Test',
      email: 'camille@example.com',
      roomsCount: 1,
      consent: true,
    })

    expect(response.statusCode).toBe(202)
    expect(dbState.demo_requests[0]).toMatchObject({ phone: null, message: null, locale: null })

    await app.close()
  })

  it('accepts the limits of every field', async () => {
    const app = await createApp()

    for (const body of [
      {
        ...validBody,
        name: 'n'.repeat(120),
        centerName: 'c'.repeat(160),
        roomsCount: DEMO_REQUEST_ROOMS_MAX,
        message: 'm'.repeat(DEMO_REQUEST_MESSAGE_MAX),
        phone: '123456',
        locale: 'en',
      },
      { ...validBody, roomsCount: 1, email: `${'a'.repeat(242)}@example.com` },
    ]) {
      expect((await send(app, body)).statusCode).toBe(202)
    }

    expect(dbState.demo_requests).toHaveLength(2)

    await app.close()
  })

  it('answers 202 without storing anything when the trap field is filled', async () => {
    const app = await createApp()

    const response = await send(app, { ...validBody, website: 'https://spam.example.com' })

    expect(response.statusCode).toBe(202)
    expect(response.json()).toEqual({ ok: true })
    expect(dbState.demo_requests).toHaveLength(0)

    await app.close()
  })

  it('answers 202 without storing anything for a robot whose other fields are invalid', async () => {
    const app = await createApp()

    const response = await send(app, { website: 'x', email: 'not-an-email' })

    expect(response.statusCode).toBe(202)
    expect(dbState.demo_requests).toHaveLength(0)

    await app.close()
  })

  it.each([
    ['name is empty', { name: '' }, 'name'],
    ['name is blank', { name: '   ' }, 'name'],
    ['name is over 120 characters', { name: 'n'.repeat(121) }, 'name'],
    ['name is missing', { name: undefined }, 'name'],
    ['centerName is empty', { centerName: '' }, 'centerName'],
    ['centerName is over 160 characters', { centerName: 'c'.repeat(161) }, 'centerName'],
    ['email is not an address', { email: 'not-an-email' }, 'email'],
    ['email is over 254 characters', { email: `${'a'.repeat(243)}@example.com` }, 'email'],
    ['phone has forbidden characters', { phone: 'call me' }, 'phone'],
    ['phone is too short', { phone: '12345' }, 'phone'],
    ['phone is over 32 characters', { phone: '1'.repeat(33) }, 'phone'],
    ['roomsCount is 0', { roomsCount: 0 }, 'roomsCount'],
    [
      `roomsCount is over ${DEMO_REQUEST_ROOMS_MAX}`,
      { roomsCount: DEMO_REQUEST_ROOMS_MAX + 1 },
      'roomsCount',
    ],
    ['roomsCount is not an integer', { roomsCount: 1.5 }, 'roomsCount'],
    ['roomsCount is a string', { roomsCount: '3' }, 'roomsCount'],
    [
      `message is over ${DEMO_REQUEST_MESSAGE_MAX} characters`,
      { message: 'm'.repeat(DEMO_REQUEST_MESSAGE_MAX + 1) },
      'message',
    ],
    ['consent is false', { consent: false }, 'consent'],
    ['consent is missing', { consent: undefined }, 'consent'],
    ['consent is the string "true"', { consent: 'true' }, 'consent'],
    ['locale is not fr or en', { locale: 'de' }, 'locale'],
    ['the trap field is not a string', { website: 5 }, 'website'],
  ])('answers 400 invalid_body when %s', async (_label, change, field) => {
    const app = await createApp()

    const response = await send(app, { ...validBody, ...change })

    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('invalid_body')
    expect(Object.keys(response.json().details.fieldErrors)).toContain(field)
    expect(dbState.demo_requests).toHaveLength(0)

    await app.close()
  })

  it('answers 400 invalid_body for a body that is not an object', async () => {
    const app = await createApp()

    for (const body of [null, [], 'text', 3]) {
      const response = await send(app, body)

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe('invalid_body')
    }

    await app.close()
  })

  it('answers 413 payload_too_large in the public format above 16 KB', async () => {
    const app = await createApp()

    const response = await send(app, { ...validBody, message: 'x'.repeat(DEMO_REQUEST_BODY_LIMIT) })

    expect(response.statusCode).toBe(413)
    expect(response.json()).toEqual({ error: 'payload_too_large' })
    expect(dbState.demo_requests).toHaveLength(0)

    await app.close()
  })

  it('answers 429 with Retry-After on the 6th send within the hour, per address', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-23T10:00:00Z'))
    const app = await createApp()

    for (let i = 0; i < DEMO_REQUEST_RATE_LIMIT_MAX; i += 1) {
      expect((await send(app, validBody)).statusCode).toBe(202)
    }

    const blocked = await send(app, validBody)

    expect(blocked.statusCode).toBe(429)
    expect(blocked.json()).toEqual({ error: 'too_many_requests' })
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0)
    expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(3600)
    expect(dbState.demo_requests).toHaveLength(DEMO_REQUEST_RATE_LIMIT_MAX)

    // Une autre adresse n'est pas touchée ; la même adresse repart après l'heure.
    expect((await send(app, validBody, '203.0.113.11')).statusCode).toBe(202)

    vi.setSystemTime(new Date('2026-11-23T11:00:01Z'))
    expect((await send(app, validBody)).statusCode).toBe(202)

    await app.close()
  })

  it('counts the robot and the invalid sends too', async () => {
    const app = await createApp()

    await send(app, { ...validBody, website: 'x' })
    await send(app, { ...validBody, email: 'nope' })
    for (let i = 0; i < DEMO_REQUEST_RATE_LIMIT_MAX - 2; i += 1) await send(app, validBody)

    expect((await send(app, validBody)).statusCode).toBe(429)

    await app.close()
  })

  it('never writes the body, the e-mail or Zod details to the log', async () => {
    const logs: string[] = []
    const app = await createApp(logs)
    const witness = { ...validBody, email: WITNESS_EMAIL, message: 'message-temoin-7d1b' }

    await send(app, witness, '203.0.113.20')
    await send(app, { ...witness, roomsCount: 0 }, '203.0.113.21')
    await send(app, { ...witness, website: 'x' }, '203.0.113.22')

    // Le journal n'est pas vide (les requêtes y sont tracées) : l'absence du témoin est donc probante.
    expect(logs.length).toBeGreaterThan(0)
    expect(logs.join('')).not.toContain('temoin')
    expect(logs.join('')).not.toContain('fieldErrors')

    await app.close()
  })

  it('answers 500 server_error and logs only the PostgreSQL code when the insert fails', async () => {
    const logs: string[] = []
    const app = await createApp(logs)
    const rows = dbState.demo_requests

    // Une erreur PostgreSQL embarque la ligne refusée dans `detail`, donc l'e-mail du prospect.
    Object.defineProperty(dbState, 'demo_requests', {
      configurable: true,
      get() {
        throw Object.assign(new Error('insert failed'), {
          code: '23514',
          detail: `Failing row contains (${WITNESS_EMAIL})`,
        })
      },
    })

    try {
      const response = await send(app, { ...validBody, email: WITNESS_EMAIL })

      expect(response.statusCode).toBe(500)
      expect(response.json()).toEqual({ error: 'server_error' })
      expect(response.body).not.toContain('temoin')
    } finally {
      Object.defineProperty(dbState, 'demo_requests', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: rows,
      })
    }

    const failure = logs.map((line) => JSON.parse(line)).find((line) => line.pgCode)

    expect(failure).toMatchObject({ pgCode: '23514', msg: 'demo request insert failed' })
    expect(logs.join('')).not.toContain('temoin')

    await app.close()
  })
})
