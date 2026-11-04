import path from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { purgeExpiredPlayerEmails as PurgeFn } from '@backend/jobs/purgePlayerEmails'
import { assertTestDatabase } from '../../setup/assertTestDatabase'

/**
 * Test d'intégration sur un vrai PostgreSQL : ignoré sans `PG_INTEGRATION_URL`.
 *
 *   PG_INTEGRATION_URL=postgresql://user:pass@localhost:5432/base_de_test \
 *     npx vitest run --config vitest.backend.config.ts \
 *     tests/backend/src/jobs/purgePlayerEmails.pg.test.ts
 *
 * ATTENTION : utiliser une base DÉDIÉE. Les migrations Knex y sont appliquées et les tables
 * `companies`, `admins`, `rooms`, `games` (et dépendantes) sont vidées avant chaque test.
 */
const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL

const NOW = new Date('2026-11-04T12:00:00.000Z')
const OLD = '2023-06-01T10:00:00.000Z'
const OLDER = '2022-01-15T10:00:00.000Z'
const RECENT = '2026-02-01T10:00:00.000Z'
// Limite = NOW - 3 ans = 2023-11-04T12:00:00.000Z
const JUST_BEFORE_CUTOFF = '2023-11-04T11:59:59.999Z'
const JUST_AFTER_CUTOFF = '2023-11-04T12:00:00.001Z'

type Db = typeof import('@backend/db').default

describe.skipIf(!PG_INTEGRATION_URL)('purgeExpiredPlayerEmails sur PostgreSQL', () => {
  let db: Db
  let purge: typeof PurgeFn

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_INTEGRATION_URL
    db = (await import('@backend/db')).default
    purge = (await import('@backend/jobs/purgePlayerEmails')).purgeExpiredPlayerEmails

    await assertTestDatabase(db)
    await db.migrate.latest({ directory: path.resolve(process.cwd(), 'backend/db/migrations') })
  }, 120_000)

  afterAll(async () => {
    await db?.destroy()
  })

  beforeEach(async () => {
    await db.raw(
      'TRUNCATE game_participants, games, rooms, admins, companies RESTART IDENTITY CASCADE'
    )

    for (const companyId of [1, 2]) {
      await db('companies').insert({
        id: companyId,
        name: `Centre ${companyId}`,
        email: `c${companyId}@x.test`,
      })
      await db('admins').insert({
        id: companyId,
        company_id: companyId,
        role: 'admin',
        username: `admin${companyId}`,
        email: `admin${companyId}@x.test`,
        mdp_hash: 'x',
      })
      await db('rooms').insert({ id: companyId, company_id: companyId, name: `Salle ${companyId}` })
    }
  })

  let nextGameId = 1
  let nextParticipantId = 1
  // Prochain pupitre libre par partie : (game_id, podium) est unique, 4 pupitres au plus.
  const podiums = new Map<number, number>()

  type GameDates = { finished?: string | null; started?: string | null; created?: string }

  async function addGame(companyId: number, dates: GameDates, deleted = false): Promise<number> {
    const id = nextGameId++

    await db('games').insert({
      id,
      company_id: companyId,
      room_id: companyId,
      admin_id: companyId,
      seed: 1,
      state: 'finished',
      finished_at: dates.finished ?? null,
      started_at: dates.started ?? null,
      created_at: dates.created ?? OLDER,
      status: deleted ? 2 : 1,
      deleted_at: deleted ? RECENT : null,
    })

    return id
  }

  type Players = { email?: string; second?: string }

  async function addParticipant(
    gameId: number,
    players: Players,
    name = 'Camille'
  ): Promise<number> {
    const id = nextParticipantId++
    const podium = (podiums.get(gameId) ?? 0) + 1
    podiums.set(gameId, podium)

    await db('game_participants').insert({
      id,
      game_id: gameId,
      podium,
      display_name: name,
      email: players.email ?? null,
      consent_at: players.email ? OLD : null,
      second_display_name: players.second ? 'Alex' : null,
      second_email: players.second ?? null,
      second_consent_at: players.second ? OLD : null,
      score: 250,
    })

    return id
  }

  async function row(id: number) {
    return db('game_participants').where({ id }).first()
  }

  beforeEach(() => {
    nextGameId = 1
    nextParticipantId = 1
    podiums.clear()
  })

  it('efface l’email et le consentement d’un joueur dont la dernière partie est ancienne', async () => {
    const participant = await addParticipant(await addGame(1, { finished: OLD }), {
      email: 'old@x.test',
    })

    await expect(purge(db, NOW)).resolves.toBe(1)

    expect(await row(participant)).toMatchObject({ email: null, consent_at: null })
  })

  it('conserve noms, scores, podium et date de mise à jour hors purge', async () => {
    const participant = await addParticipant(await addGame(1, { finished: OLD }), {
      email: 'old@x.test',
      second: 'alex@x.test',
    })

    await purge(db, NOW)

    expect(await row(participant)).toMatchObject({
      display_name: 'Camille',
      second_display_name: 'Alex',
      score: 250,
      podium: 1,
    })
  })

  it('garde l’email d’un joueur récent', async () => {
    const participant = await addParticipant(await addGame(1, { finished: RECENT }), {
      email: 'recent@x.test',
    })

    await expect(purge(db, NOW)).resolves.toBe(0)

    expect(await row(participant)).toMatchObject({
      email: 'recent@x.test',
      consent_at: new Date(OLD),
    })
  })

  it('même email dans une partie récente de la MÊME compagnie : gardé partout', async () => {
    const oldOne = await addParticipant(await addGame(1, { finished: OLD }), {
      email: 'reg@x.test',
    })
    const recentOne = await addParticipant(await addGame(1, { finished: RECENT }), {
      email: 'reg@x.test',
    })

    await expect(purge(db, NOW)).resolves.toBe(0)

    expect((await row(oldOne)).email).toBe('reg@x.test')
    expect((await row(recentOne)).email).toBe('reg@x.test')
  })

  it('même email dans une AUTRE compagnie récente : effacé chez la compagnie de la vieille partie seulement', async () => {
    const oldOne = await addParticipant(await addGame(1, { finished: OLD }), {
      email: 'multi@x.test',
    })
    const recentElsewhere = await addParticipant(await addGame(2, { finished: RECENT }), {
      email: 'multi@x.test',
    })

    await expect(purge(db, NOW)).resolves.toBe(1)

    expect(await row(oldOne)).toMatchObject({ email: null, consent_at: null })
    expect(await row(recentElsewhere)).toMatchObject({ email: 'multi@x.test' })
  })

  it('même email ancien dans deux compagnies : effacé dans les deux', async () => {
    const first = await addParticipant(await addGame(1, { finished: OLD }), {
      email: 'both@x.test',
    })
    const second = await addParticipant(await addGame(2, { finished: OLDER }), {
      email: 'both@x.test',
    })

    await expect(purge(db, NOW)).resolves.toBe(2)

    expect((await row(first)).email).toBeNull()
    expect((await row(second)).email).toBeNull()
  })

  it('efface toutes les occurrences anciennes d’un email dans la compagnie', async () => {
    const a = await addParticipant(await addGame(1, { finished: OLD }), { email: 'gone@x.test' })
    const b = await addParticipant(await addGame(1, { finished: OLDER }), { email: 'gone@x.test' })

    await expect(purge(db, NOW)).resolves.toBe(2)

    expect((await row(a)).email).toBeNull()
    expect((await row(b)).email).toBeNull()
  })

  it('2e joueur : effacé sans toucher au 1er joueur récent', async () => {
    const oldGame = await addParticipant(await addGame(1, { finished: OLD }), {
      email: 'first@x.test',
      second: 'old2@x.test',
    })
    await addParticipant(await addGame(1, { finished: RECENT }), { email: 'first@x.test' })

    await expect(purge(db, NOW)).resolves.toBe(1)

    expect(await row(oldGame)).toMatchObject({
      email: 'first@x.test',
      consent_at: new Date(OLD),
      second_email: null,
      second_consent_at: null,
    })
  })

  it('une participation récente en 2e joueur garde l’email du 1er joueur d’une vieille partie', async () => {
    const oldGame = await addParticipant(await addGame(1, { finished: OLD }), {
      email: 'dual@x.test',
    })
    const recentGame = await addParticipant(await addGame(1, { finished: RECENT }), {
      second: 'dual@x.test',
    })

    await expect(purge(db, NOW)).resolves.toBe(0)

    expect((await row(oldGame)).email).toBe('dual@x.test')
    expect((await row(recentGame)).second_email).toBe('dual@x.test')
  })

  it('une participation récente en 1er joueur garde l’email du 2e joueur d’une vieille partie', async () => {
    const oldGame = await addParticipant(await addGame(1, { finished: OLD }), {
      second: 'dual@x.test',
    })
    await addParticipant(await addGame(1, { finished: RECENT }), { email: 'dual@x.test' })

    await expect(purge(db, NOW)).resolves.toBe(0)

    expect((await row(oldGame)).second_email).toBe('dual@x.test')
  })

  it('une ligne dont les deux joueurs sont périmés : les deux emails et consentements sont effacés', async () => {
    const participant = await addParticipant(await addGame(1, { finished: OLD }), {
      email: 'a@x.test',
      second: 'b@x.test',
    })

    await expect(purge(db, NOW)).resolves.toBe(2)

    expect(await row(participant)).toMatchObject({
      email: null,
      consent_at: null,
      second_email: null,
      second_consent_at: null,
    })
  })

  it('compare les emails sans tenir compte de la casse ni des espaces', async () => {
    const oldOne = await addParticipant(await addGame(1, { finished: OLD }), {
      email: 'Casse@X.test',
    })
    await addParticipant(await addGame(1, { finished: RECENT }), { email: '  casse@x.TEST ' })

    await expect(purge(db, NOW)).resolves.toBe(0)

    expect((await row(oldOne)).email).toBe('Casse@X.test')
  })

  it('efface toutes les variantes de casse d’un email ancien', async () => {
    const a = await addParticipant(await addGame(1, { finished: OLD }), { email: 'Casse@X.test' })
    const b = await addParticipant(await addGame(1, { finished: OLDER }), {
      email: ' casse@x.test',
    })

    await expect(purge(db, NOW)).resolves.toBe(2)

    expect((await row(a)).email).toBeNull()
    expect((await row(b)).email).toBeNull()
  })

  it('date de partie : started_at puis date de création quand finished_at manque', async () => {
    const startedRecent = await addParticipant(
      await addGame(1, { started: RECENT, created: OLDER }),
      { email: 'started@x.test' }
    )
    const createdRecent = await addParticipant(await addGame(1, { created: RECENT }), {
      email: 'created@x.test',
    })
    const createdOld = await addParticipant(await addGame(1, { created: OLD }), {
      email: 'oldcreated@x.test',
    })

    await expect(purge(db, NOW)).resolves.toBe(1)

    expect((await row(startedRecent)).email).toBe('started@x.test')
    expect((await row(createdRecent)).email).toBe('created@x.test')
    expect((await row(createdOld)).email).toBeNull()
  })

  it('finished_at l’emporte sur started_at', async () => {
    const participant = await addParticipant(await addGame(1, { finished: RECENT, started: OLD }), {
      email: 'long@x.test',
    })

    await expect(purge(db, NOW)).resolves.toBe(0)

    expect((await row(participant)).email).toBe('long@x.test')
  })

  it('limite stricte : juste avant la date limite effacé, juste après gardé', async () => {
    const before = await addParticipant(await addGame(1, { finished: JUST_BEFORE_CUTOFF }), {
      email: 'before@x.test',
    })
    const after = await addParticipant(await addGame(1, { finished: JUST_AFTER_CUTOFF }), {
      email: 'after@x.test',
    })

    await expect(purge(db, NOW)).resolves.toBe(1)

    expect((await row(before)).email).toBeNull()
    expect((await row(after)).email).toBe('after@x.test')
  })

  it('compte les parties supprimées logiquement', async () => {
    const oldOne = await addParticipant(await addGame(1, { finished: OLD }), {
      email: 'del@x.test',
    })
    await addParticipant(await addGame(1, { finished: RECENT }, true), { email: 'del@x.test' })

    await expect(purge(db, NOW)).resolves.toBe(0)

    expect((await row(oldOne)).email).toBe('del@x.test')
  })

  it('ignore les participants sans email et renseigne updated_at seulement sur les lignes purgées', async () => {
    const game = await addGame(1, { finished: OLD })
    const withoutEmail = await addParticipant(game, {}, 'Sans email')
    const purged = await addParticipant(game, { email: 'old@x.test' })

    await expect(purge(db, NOW)).resolves.toBe(1)

    expect((await row(withoutEmail)).updated_at).toBeNull()
    expect((await row(purged)).updated_at).toEqual(NOW)
  })

  it('est idempotente', async () => {
    await addParticipant(await addGame(1, { finished: OLD }), { email: 'old@x.test' })

    await expect(purge(db, NOW)).resolves.toBe(1)
    await expect(purge(db, NOW)).resolves.toBe(0)
  })

  it('supporte plus de 65 535 emails périmés (limite de paramètres PostgreSQL)', async () => {
    // 70 000 parties d'un participant chacune (un pupitre par partie).
    await db.raw(
      `INSERT INTO games (company_id, room_id, admin_id, seed, state, finished_at, created_at)
       SELECT 1, 1, 1, 1, 'finished', ?, ? FROM generate_series(1, 70000)`,
      [OLD, OLD]
    )
    await db.raw(
      `INSERT INTO game_participants (game_id, podium, display_name, email, consent_at)
       SELECT id, 1, 'Joueur', 'bulk' || id || '@x.test', ? FROM games`,
      [OLD]
    )

    await expect(purge(db, NOW)).resolves.toBe(70000)
  }, 120_000)

  it('deux purges simultanées ne se chevauchent pas (verrou consultatif)', async () => {
    await addParticipant(await addGame(1, { finished: OLD }), { email: 'old@x.test' })

    const counts = await Promise.all([purge(db, NOW), purge(db, NOW)])

    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(1)
  })
})
