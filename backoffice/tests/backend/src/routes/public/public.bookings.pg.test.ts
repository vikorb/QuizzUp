import path from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { computeRoomSlots } from '@quizzup/shared'
import { generateApiKey } from '@backend/security/apiKeys'
import { assertTestDatabase } from '../../../setup/assertTestDatabase'
import { bearer, createPublicApp, OPEN_EVERY_DAY } from '../_helpers/publicApi'

/**
 * Test d'intégration sur un vrai PostgreSQL : ignoré sans `PG_INTEGRATION_URL`.
 *
 *   PG_INTEGRATION_URL=postgresql://user:pass@localhost:5432/base_de_test \
 *     npx vitest run --config vitest.backend.config.ts --no-file-parallelism \
 *     tests/backend/src/routes/public/public.bookings.pg.test.ts
 *
 * Le `mockDb` n'applique ni contrainte ni verrou : l'idempotence de deux appels simultanés et le
 * créneau déjà pris (contrainte d'exclusion, SQLSTATE 23P01 → `slot_taken`) ne se prouvent que sur
 * la vraie base.
 *
 * ATTENTION : base DÉDIÉE (le nom doit finir par `_test`). Les migrations y sont appliquées et les
 * tables `api_*`, `games`, `rooms`, `admins` et `companies` sont vidées avant chaque test.
 */
const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL

type Db = typeof import('@backend/db').default
type App = Awaited<ReturnType<typeof createPublicApp>>

const TRUNCATE_TABLES =
  'TRUNCATE api_request_logs, api_idempotency_keys, api_keys, game_participants, games, rooms, admins, companies RESTART IDENTITY CASCADE'

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

// Créneaux (UTC) de la grille de la salle, dans dix jours : horloge réelle, pas d'horloge simulée.
const date = new Date(Date.now() + 10 * DAY_MS).toISOString().slice(0, 10)
const [SLOT, SECOND_SLOT, THIRD_SLOT] = computeRoomSlots({
  schedule: OPEN_EVERY_DAY,
  date,
  now: new Date(),
}).map((slot) => slot.startsAt) as [string, string, string]

const LEA = {
  podium: 1,
  displayName: 'Léa',
  email: 'lea@exemple.test',
  emailConsent: true,
  secondPlayer: { displayName: 'Noé', email: 'noe@exemple.test', emailConsent: true },
}

describe.skipIf(!PG_INTEGRATION_URL)("réservations de l'API publique sur PostgreSQL", () => {
  let db: Db
  let app: App
  let headersA: Record<string, string>
  let headersB: Record<string, string>

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_INTEGRATION_URL
    db = (await import('@backend/db')).default

    await assertTestDatabase(db)
    await db.migrate.latest({ directory: path.resolve(process.cwd(), 'backend/db/migrations') })
    app = await createPublicApp()
  }, 120_000)

  afterAll(async () => {
    await app?.close()
    // La base est partagée avec les autres fichiers `.pg.test.ts` : ne rien y laisser.
    await db?.raw(TRUNCATE_TABLES)
    await db?.destroy()
  }, 30_000)

  beforeEach(async () => {
    await db.raw(TRUNCATE_TABLES)

    for (const companyId of [1, 2]) {
      await db('companies').insert({
        id: companyId,
        name: `Centre ${companyId}`,
        email: `c${companyId}@x.test`,
      })
      await db('rooms').insert({
        id: companyId,
        company_id: companyId,
        name: `Salle ${companyId}`,
        schedule: JSON.stringify(OPEN_EVERY_DAY),
      })
    }

    const keys = [1, 2].map((companyId) => ({ companyId, ...generateApiKey() }))

    await db('api_keys').insert(
      keys.map((key) => ({
        company_id: key.companyId,
        name: 'Site web',
        key_prefix: key.prefix,
        key_hash: key.hash,
      }))
    )
    headersA = bearer(keys[0]!.token)
    headersB = bearer(keys[1]!.token)
  }, 30_000)

  const book = (
    key: string,
    body: Record<string, unknown> = {},
    headers: Record<string, string> = headersA
  ) =>
    app.inject({
      method: 'POST',
      url: '/public/v1/bookings',
      headers: { ...headers, 'idempotency-key': key },
      payload: { roomId: 1, startsAt: SLOT, ...body },
    })

  const count = async (table: string) =>
    Number((await db(table).count({ count: '*' }).first())!.count)

  it('creates one session for two simultaneous calls with the same key', async () => {
    const responses = await Promise.all([
      book('same', { participants: [LEA] }),
      book('same', { participants: [LEA] }),
    ])

    expect(responses.map((response) => response.statusCode)).toEqual([201, 201])
    expect(responses.filter((r) => r.headers['idempotent-replayed'] === 'true')).toHaveLength(1)
    expect(responses[0]!.json().booking.id).toBe(responses[1]!.json().booking.id)
    expect(await count('games')).toBe(1)
    expect(await count('game_participants')).toBe(1)
    expect(await count('api_idempotency_keys')).toBe(1)
  }, 30_000)

  it('settles a burst of 12 calls with the same key without exhausting the pool of 10', async () => {
    // Une transaction tient le verrou de la clé : les 12 appels s'empilent, chacun sur sa transaction,
    // et occupent tout le pool. Le premier à passer ne doit plus avoir besoin d'une autre connexion.
    const holder = await db.transaction()

    await holder.raw('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', ['1:burst'])

    const calls = Array.from({ length: 12 }, () => book('burst', { participants: [LEA] }))

    await new Promise((resolve) => setTimeout(resolve, 1000))
    await holder.commit()

    const responses = await Promise.all(calls)

    expect(responses.map((response) => response.statusCode)).toEqual(Array(12).fill(201))
    expect(responses.filter((r) => r.headers['idempotent-replayed'] === 'true')).toHaveLength(11)
    expect(new Set(responses.map((r) => r.json().booking.id)).size).toBe(1)
    expect(await count('games')).toBe(1)
  }, 25_000)

  it('refuses a change that waits for a session the centre opens in the meantime', async () => {
    const created = await book('first')
    const id = created.json().booking.id
    // Le centre ouvre la session : sa transaction tient la ligne, sans avoir encore validé.
    const opening = await db.transaction()

    await opening('games').where('id', id).forUpdate().first()
    await opening('games').where('id', id).update({ state: 'pending' })

    const patch = app.inject({
      method: 'PATCH',
      url: `/public/v1/bookings/${id}`,
      headers: headersA,
      payload: { externalRef: 'trop-tard' },
    })

    await new Promise((resolve) => setTimeout(resolve, 500))
    await opening.commit()
    const response = await patch

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({ error: 'booking_not_modifiable' })
    expect((await db('games').where('id', id).first())!.external_ref).toBeNull()
  }, 30_000)

  it('lets one of two simultaneous calls on the same slot through: 201 and 409', async () => {
    const responses = await Promise.all([book('first'), book('second')])

    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409])
    expect(responses.find((response) => response.statusCode === 409)!.json()).toEqual({
      error: 'slot_taken',
    })
    expect(await count('games')).toBe(1)
    // Le refus ne retient pas sa clé.
    expect(await count('api_idempotency_keys')).toBe(1)
  }, 30_000)

  it('does not remember a call refused as slot_taken: the same key books another slot', async () => {
    await book('first')

    const taken = await book('retry')
    const free = await book('retry', { startsAt: SECOND_SLOT })

    expect(taken.statusCode).toBe(409)
    expect(free.statusCode).toBe(201)
    expect(free.headers['idempotent-replayed']).toBeUndefined()
    expect(await count('games')).toBe(2)
  }, 30_000)

  it('keeps back-to-back slots apart and frees the slot of a cancelled booking', async () => {
    const first = await book('first')
    const next = await book('next', { startsAt: SECOND_SLOT })
    const refused = await book('again')

    const cancelled = await app.inject({
      method: 'DELETE',
      url: `/public/v1/bookings/${first.json().booking.id}`,
      headers: headersA,
    })
    const reused = await book('reused')

    expect([first, next, refused, cancelled, reused].map((r) => r.statusCode)).toEqual([
      201, 201, 409, 200, 201,
    ])
  }, 30_000)

  it('erases the e-mails of a cancelled booking in the database', async () => {
    const created = await book('first', { participants: [LEA] })

    await app.inject({
      method: 'DELETE',
      url: `/public/v1/bookings/${created.json().booking.id}`,
      headers: headersA,
    })

    expect(await db('game_participants').first()).toMatchObject({
      display_name: 'Léa',
      email: null,
      consent_at: null,
      second_email: null,
      second_consent_at: null,
    })
  }, 30_000)

  it('lets company B neither read nor book what belongs to company A', async () => {
    const created = await book('first')

    const read = await app.inject({
      method: 'GET',
      url: `/public/v1/bookings/${created.json().booking.id}`,
      headers: headersB,
    })
    const onRoomOfA = await book('b-key', {}, headersB)
    const own = await book('b-key', { roomId: 2 }, headersB)

    expect(read.statusCode).toBe(404)
    expect(onRoomOfA.statusCode).toBe(404)
    expect(own.statusCode).toBe(201)
    expect(await count('games')).toBe(2)
  }, 30_000)

  it('purges the e-mails of an API booking with the usual retention, and only those', async () => {
    const { purgeExpiredPlayerEmails } = await import('@backend/jobs/purgePlayerEmails')
    const old = await book('old', { participants: [LEA] })
    const recent = await book('recent', {
      startsAt: THIRD_SLOT,
      participants: [
        { podium: 1, displayName: 'Zoé', email: 'zoe@exemple.test', emailConsent: true },
      ],
    })
    // Créée il y a plus de trois ans, pour une session encore à venir : la purge se fie à la
    // création de la réservation tant que la partie n'a pas eu lieu.
    await db('games')
      .where('id', old.json().booking.id)
      .update({ created_at: new Date(Date.now() - 4 * 365 * DAY_MS - HOUR_MS) })

    const purged = await purgeExpiredPlayerEmails(db)

    expect(purged).toBeGreaterThan(0)
    expect(
      await db('game_participants').where('game_id', old.json().booking.id).first()
    ).toMatchObject({ email: null, consent_at: null, second_email: null, second_consent_at: null })
    expect(
      await db('game_participants').where('game_id', recent.json().booking.id).first()
    ).toMatchObject({ email: 'zoe@exemple.test' })
  }, 30_000)
})
