import path from 'node:path'

import fastify from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { JOIN_MAX_PENDING_REGISTRATIONS } from '@quizzup/shared'

import { assertTestDatabase } from '../../setup/assertTestDatabase'

/**
 * Test d'intégration sur un vrai PostgreSQL : ignoré sans `PG_INTEGRATION_URL`.
 *
 *   PG_INTEGRATION_URL=postgresql://user:pass@localhost:5432/base_de_test \
 *     npx vitest run --config vitest.backend.config.ts \
 *     tests/backend/src/db/publicJoin.pg.test.ts
 *
 * Le `mockDb` joue les requêtes l'une après l'autre : il ne peut pas prouver que le verrou de la
 * partie (`FOR UPDATE`) tient le plafond d'inscriptions sous deux envois simultanés, ni que la
 * relecture du jeton dans la transaction attrape une partie lancée pendant l'envoi.
 *
 * ATTENTION : base DÉDIÉE (le nom doit finir par `_test`). Les migrations y sont appliquées et les
 * tables `game_registrations`, `game_participants`, `games`, `rooms`, `admins`, `companies` sont
 * vidées avant chaque test et à la fin.
 */
const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL

type Db = typeof import('@backend/db').default
type App = ReturnType<typeof fastify>

const TRUNCATE_TABLES =
  'TRUNCATE game_registrations, game_participants, games, rooms, admins, companies RESTART IDENTITY CASCADE'

const TOKEN = 'a'.repeat(43)

describe.skipIf(!PG_INTEGRATION_URL)('accueil par QR code : envois simultanés', () => {
  let db: Db
  let app: App
  let registrationsUrl: string

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_INTEGRATION_URL
    db = (await import('@backend/db')).default

    await assertTestDatabase(db)
    await db.migrate.latest({ directory: path.resolve(process.cwd(), 'backend/db/migrations') })

    const { default: publicRoutes } = await import('@backend/routes/public')
    const { PUBLIC_API_PREFIX } = await import('@backend/routes/public/_shared')

    registrationsUrl = `${PUBLIC_API_PREFIX}/join/registrations`
    app = fastify({ logger: false })
    await app.register(publicRoutes as never, { prefix: PUBLIC_API_PREFIX })
    await app.ready()
  }, 120_000)

  // Base partagée avec les autres `*.pg.test.ts` : on ne laisse aucune ligne derrière nous.
  afterAll(async () => {
    await app?.close()
    await db?.raw(TRUNCATE_TABLES)
    await db?.destroy()
  }, 30_000)

  beforeEach(async () => {
    await db.raw(TRUNCATE_TABLES)

    await db('companies').insert({ id: 1, name: 'Centre', email: 'c@x.test' })
    await db('admins').insert({
      id: 1,
      company_id: 1,
      role: 'admin',
      username: 'admin',
      email: 'admin@x.test',
      mdp_hash: 'x',
    })
    await db('rooms').insert({ id: 1, company_id: 1, name: 'Salle 1' })
    await db('games').insert({
      id: 1,
      company_id: 1,
      room_id: 1,
      admin_id: 1,
      seed: 1,
      state: 'pending',
      join_token: TOKEN,
      join_expires_at: new Date(Date.now() + 60 * 60 * 1000),
    })
  }, 30_000)

  // Tient le verrou de la partie (et applique `changes` sous ce verrou) jusqu'à `release()`. Un
  // test qui échoue ne doit pas laisser la transaction ouverte : `TRUNCATE` attendrait son verrou.
  let release: (() => Promise<void>) | undefined

  async function holdGameLock(changes: Record<string, unknown> = {}) {
    let open!: () => void
    let locked!: () => void
    const stayOpen = new Promise<void>((resolve) => {
      open = resolve
    })
    const lockTaken = new Promise<void>((resolve) => {
      locked = resolve
    })
    const done = db.transaction(async (trx) => {
      await trx('games').where('id', 1).forUpdate().first()
      if (Object.keys(changes).length > 0) await trx('games').where('id', 1).update(changes)
      locked()
      await stayOpen
    })

    await Promise.race([lockTaken, done])
    release = async () => {
      open()
      await done
    }
  }

  afterEach(async () => {
    await release?.()
    release = undefined
  })

  const send = (displayName: string) =>
    app.inject({
      method: 'POST',
      url: registrationsUrl,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ token: TOKEN, displayName }),
    })

  // Attend que `count` requêtes soient bloquées sur un verrou : sans cela, deux envois « simultanés »
  // pourraient en fait passer l'un après l'autre et le test ne prouverait rien.
  const waitForLockWaiters = (count: number) =>
    expect
      .poll(
        async () =>
          Number(
            (
              await db.raw(
                `select count(*) as count from pg_stat_activity
                 where datname = current_database() and wait_event_type = 'Lock'`
              )
            ).rows[0].count
          ),
        { timeout: 10_000 }
      )
      .toBe(count)

  const countRegistrations = async () =>
    Number((await db('game_registrations').where('game_id', 1).count({ count: '*' }))[0].count)

  it('accepte un seul de deux envois simultanés quand il reste une place', async () => {
    await db('game_registrations').insert(
      Array.from({ length: JOIN_MAX_PENDING_REGISTRATIONS - 1 }, (_, index) => ({
        game_id: 1,
        display_name: `Joueur ${index}`,
      }))
    )

    // Les deux envois arrivent ensemble : on tient le verrou de la partie le temps qu'ils s'y
    // présentent tous les deux, puis on le rend. Sans `FOR UPDATE`, aucun ne s'arrête ici.
    await holdGameLock()

    const pending = Promise.all([send('Camille'), send('Dominique')])

    await waitForLockWaiters(2)
    await release!()

    const responses = await pending

    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409])
    expect(responses.find((response) => response.statusCode === 409)?.json()).toEqual({
      error: 'join_full',
    })
    expect(await countRegistrations()).toBe(JOIN_MAX_PENDING_REGISTRATIONS)
  })

  it('refuse avec 410 un envoi pendant lequel la partie est lancée', async () => {
    // La partie passe en cours dans une transaction encore ouverte : l'envoi la voit en attente
    // (il ne lit que ce qui est validé), puis attend son verrou dans la transaction d'inscription.
    await holdGameLock({ state: 'running' })

    const pending = send('Camille')

    await waitForLockWaiters(1)
    await release!()

    const response = await pending

    expect(response.statusCode).toBe(410)
    expect(response.json()).toEqual({ error: 'join_link_closed' })
    expect(await countRegistrations()).toBe(0)
  })

  it('ne recopie pas les valeurs de la requête dans le message d’une erreur SQL', async () => {
    // Clé étrangère inconnue : l'erreur remonte du serveur. Avec la valeur par défaut de knex, le
    // message contiendrait la requête compilée, prénom compris.
    const error = await db('game_registrations')
      .insert({ game_id: 999, display_name: 'Prénom secret' })
      .then(
        () => null,
        (caught: Error & { code?: string }) => caught
      )

    expect(error?.code).toBe('23503')
    expect(error?.message).toContain('game_registrations')
    expect(error?.message).not.toContain('Prénom secret')
  })
})
