import { createRequire } from 'node:module'
import path from 'node:path'

import type dbModule from '@backend/db'
import type { findAvoidQuestionIds as findAvoidQuestionIdsType } from '@backend/routes/room/_history'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { assertTestDatabase } from '../../setup/assertTestDatabase'
import {
  authHeaders,
  companyAdminUser,
  createRouteApp,
  parseJson,
  type TestUser,
} from '../routes/_helpers/testApp'

/**
 * Test d'intégration sur un vrai PostgreSQL : ignoré sans `PG_INTEGRATION_URL`.
 *
 *   PG_INTEGRATION_URL=postgresql://user:pass@localhost:5432/base_de_test \
 *     npx vitest run --config vitest.backend.config.ts \
 *     tests/backend/src/db/avoidQuestions.pg.test.ts
 *
 * La requête des questions déjà vues (`findAvoidQuestionIds`) lit des tableaux `jsonb`, joint les
 * pupitres par e-mail normalisé et plafonne le résultat : le `mockDb` ne sait rien de tout cela.
 *
 * ATTENTION : utiliser une base DÉDIÉE. Les migrations Knex y sont appliquées et les tables
 * `game_rounds`, `game_participants`, `games`, `rooms`, `admins`, `companies` sont vidées avant
 * chaque test.
 */
const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL

const TRUNCATE_TABLES =
  'TRUNCATE game_rounds, game_participants, games, rooms, admins, companies RESTART IDENTITY CASCADE'

type Db = typeof dbModule

const require = createRequire(import.meta.url)
const indexMigration = require(
  path.resolve(
    process.cwd(),
    'backend/db/migrations/20261124180000_add_normalized_email_indexes_to_game_participants.js'
  )
) as { up: (knex: Db) => Promise<void>; down: (knex: Db) => Promise<void> }

const EMAIL_INDEXES = [
  'game_participants_email_normalized_index',
  'game_participants_second_email_normalized_index',
]

const roomDesk = { ...companyAdminUser, role: 'room', room_id: 1, sid: 'sid-room' } as TestUser

// Partie à lancer : compagnie 1, salle 1, jouée par un joueur dont l'e-mail est connu.
const CURRENT_GAME = 100

describe.skipIf(!PG_INTEGRATION_URL)('questions déjà vues par les joueurs d’une partie', () => {
  let db: Db
  let roomApp: FastifyInstance
  let findAvoidQuestionIds: typeof findAvoidQuestionIdsType

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_INTEGRATION_URL
    db = (await import('@backend/db')).default

    await assertTestDatabase(db)
    await db.migrate.latest({ directory: path.resolve(process.cwd(), 'backend/db/migrations') })
    ;({ findAvoidQuestionIds } = await import('@backend/routes/room/_history'))
    roomApp = await createRouteApp((await import('@backend/routes/room')).default)
  }, 120_000)

  // Base partagée avec les autres `*.pg.test.ts` : on ne laisse aucune ligne derrière nous.
  afterAll(async () => {
    await roomApp?.close()
    await db?.raw(TRUNCATE_TABLES)
    await db?.destroy()
  })

  beforeEach(async () => {
    await db.raw(TRUNCATE_TABLES)

    await db('companies').insert([
      { id: 1, name: 'Centre A', email: 'a@x.test' },
      { id: 2, name: 'Centre B', email: 'b@x.test' },
    ])
    await db('admins').insert([
      { id: 1, company_id: 1, role: 'admin', username: 'a', email: 'a1@x.test', mdp_hash: 'x' },
      { id: 2, company_id: 2, role: 'admin', username: 'b', email: 'b1@x.test', mdp_hash: 'x' },
    ])
    await db('rooms').insert([
      { id: 1, company_id: 1, name: 'Salle A' },
      { id: 2, company_id: 2, name: 'Salle B' },
    ])
    await addGame(CURRENT_GAME, { state: 'running' })
  })

  async function addGame(
    id: number,
    options: { companyId?: number; state?: string; finishedAt?: string; deleted?: boolean } = {}
  ) {
    const companyId = options.companyId ?? 1

    await db('games').insert({
      id,
      company_id: companyId,
      room_id: companyId,
      admin_id: companyId,
      seed: 1,
      state: options.state ?? 'finished',
      finished_at: options.finishedAt ?? '2026-11-01T18:00:00Z',
      status: options.deleted ? 2 : 1,
      deleted_at: options.deleted ? '2026-11-02T10:00:00Z' : null,
    })
  }

  async function addPlayer(
    gameId: number,
    emails: { email?: string | null; secondEmail?: string | null },
    podium = 1
  ) {
    const consent = new Date('2026-11-01T17:00:00Z')

    await db('game_participants').insert({
      game_id: gameId,
      podium,
      display_name: 'Joueur',
      email: emails.email ?? null,
      consent_at: (emails.email ?? null) === null ? null : consent,
      second_display_name: (emails.secondEmail ?? null) === null ? null : 'Second',
      second_email: emails.secondEmail ?? null,
      second_consent_at: (emails.secondEmail ?? null) === null ? null : consent,
    })
  }

  const addRound = (gameId: number, position: number, questionIds: number[]) =>
    db('game_rounds').insert({
      game_id: gameId,
      position,
      mini_game: 'quick_answer',
      questions: JSON.stringify(questionIds),
    })

  const avoidOf = (gameId = CURRENT_GAME, companyId = 1) => findAvoidQuestionIds(companyId, gameId)

  it('rend les questions des parties terminées où figure un joueur connu par son e-mail', async () => {
    await addPlayer(CURRENT_GAME, { email: 'lea@x.test' })
    await addGame(1)
    await addPlayer(1, { email: 'lea@x.test' })
    await addRound(1, 1, [10, 11])
    await addRound(1, 2, [11, 12])
    // Un autre joueur, jamais croisé : ses questions ne comptent pas.
    await addGame(2)
    await addPlayer(2, { email: 'tom@x.test' })
    await addRound(2, 1, [30])

    expect(await avoidOf()).toEqual([10, 11, 12])
  })

  it('reconnaît l’e-mail malgré la casse et les espaces, et sur le second joueur', async () => {
    await addPlayer(CURRENT_GAME, { email: '  LEA@x.test ' }, 1)
    await addPlayer(CURRENT_GAME, { email: 'hugo@x.test', secondEmail: 'ines@x.test' }, 2)
    await addGame(1)
    await addPlayer(1, { email: 'lea@X.TEST' })
    await addRound(1, 1, [10])
    await addGame(2)
    await addPlayer(2, { email: 'autre@x.test', secondEmail: ' Hugo@x.test' })
    await addRound(2, 1, [20])
    await addGame(3)
    await addPlayer(3, { email: 'zoe@x.test', secondEmail: 'INES@x.test' })
    await addRound(3, 1, [30])

    expect((await avoidOf()).sort((a, b) => a - b)).toEqual([10, 20, 30])
  })

  it('ne connaît pas les joueurs sans e-mail', async () => {
    await addPlayer(CURRENT_GAME, { email: null })
    await addGame(1)
    await addPlayer(1, { email: null })
    await addRound(1, 1, [10])

    expect(await avoidOf()).toEqual([])
  })

  it('ne prend pas deux joueurs sans e-mail, mais avec une chaîne vide, pour le même joueur', async () => {
    await addPlayer(CURRENT_GAME, { email: '  ', secondEmail: '' })
    await addPlayer(CURRENT_GAME, { email: 'lea@x.test' }, 2)
    await addGame(1)
    await addPlayer(1, { email: '', secondEmail: ' ' })
    await addRound(1, 1, [10])
    await addGame(2)
    await addPlayer(2, { email: ' ' })
    await addRound(2, 1, [20])

    expect(await avoidOf()).toEqual([])

    // La partie courante n'a que des e-mails vides : aucun joueur connu, même résultat.
    await db('game_participants').where({ game_id: CURRENT_GAME, podium: 2 }).delete()

    expect(await avoidOf()).toEqual([])
  })

  it('ne compte ni les parties non terminées, ni les parties supprimées, ni la partie elle-même', async () => {
    await addPlayer(CURRENT_GAME, { email: 'lea@x.test' })
    await addRound(CURRENT_GAME, 1, [1])
    await addGame(1, { state: 'aborted' })
    await addPlayer(1, { email: 'lea@x.test' })
    await addRound(1, 1, [2])
    await addGame(2, { deleted: true })
    await addPlayer(2, { email: 'lea@x.test' })
    await addRound(2, 1, [3])

    expect(await avoidOf()).toEqual([])
  })

  it('ne montre pas l’historique d’une autre compagnie', async () => {
    await addPlayer(CURRENT_GAME, { email: 'lea@x.test' })
    // Même e-mail, mais dans la compagnie B.
    await addGame(1, { companyId: 2 })
    await addPlayer(1, { email: 'lea@x.test' })
    await addRound(1, 1, [50])

    expect(await avoidOf()).toEqual([])

    // Et dans l'autre sens : la partie de la compagnie B ne voit rien de la compagnie A.
    await addGame(2)
    await addPlayer(2, { email: 'lea@x.test' })
    await addRound(2, 1, [60])
    await addGame(200, { companyId: 2, state: 'running' })
    await addPlayer(200, { email: 'lea@x.test' })

    expect(await avoidOf()).toEqual([60])
    expect(await avoidOf(200, 2)).toEqual([50])
  })

  it('met les parties les plus récentes d’abord, dans un ordre stable', async () => {
    await addPlayer(CURRENT_GAME, { email: 'lea@x.test' })
    await addGame(1, { finishedAt: '2026-10-01T18:00:00Z' })
    await addPlayer(1, { email: 'lea@x.test' })
    await addRound(1, 1, [5, 6])
    await addGame(2, { finishedAt: '2026-11-10T18:00:00Z' })
    await addPlayer(2, { email: 'lea@x.test' })
    await addRound(2, 1, [9, 1])
    // La question 5 revue en dernier : elle prend la date de la partie la plus récente.
    await addGame(3, { finishedAt: '2026-11-20T18:00:00Z' })
    await addPlayer(3, { email: 'lea@x.test' })
    await addRound(3, 1, [5])

    const first = await avoidOf()

    expect(first).toEqual([5, 1, 9, 6])
    expect(await avoidOf()).toEqual(first)
  })

  it('plafonne la liste aux 2 000 questions les plus récentes', async () => {
    await addPlayer(CURRENT_GAME, { email: 'lea@x.test' })
    await addGame(1, { finishedAt: '2026-10-01T18:00:00Z' })
    await addPlayer(1, { email: 'lea@x.test' })
    await addRound(1, 1, [999_999])
    await addGame(2)
    await addPlayer(2, { email: 'lea@x.test' })
    await db.raw(
      `INSERT INTO game_rounds (game_id, position, mini_game, questions)
       SELECT 2, 1, 'quick_answer', jsonb_agg(n) FROM generate_series(1, 2100) AS n`
    )

    const ids = await avoidOf()

    expect(ids).toHaveLength(2000)
    expect(ids[0]).toBe(1)
    expect(ids).not.toContain(999_999)
  })

  it('survit à une manche sans questions ou dont les questions ne sont pas un tableau', async () => {
    await addPlayer(CURRENT_GAME, { email: 'lea@x.test' })
    await addGame(1)
    await addPlayer(1, { email: 'lea@x.test' })
    await addRound(1, 1, [])
    await db('game_rounds').insert({ game_id: 1, position: 2, mini_game: 'streak' })
    await db.raw(
      `INSERT INTO game_rounds (game_id, position, mini_game, questions)
       VALUES (1, 3, 'streak', CAST('7' AS jsonb)), (1, 4, 'streak', CAST('[8]' AS jsonb))`
    )

    expect(await avoidOf()).toEqual([8])
  })

  it('est renvoyée dans `game.avoidQuestionIds` de GET /room/games/current', async () => {
    await addPlayer(CURRENT_GAME, { email: 'lea@x.test' })
    await addGame(1)
    await addPlayer(1, { email: 'lea@x.test' })
    await addRound(1, 1, [10, 11])

    const response = await roomApp.inject({
      method: 'GET',
      url: '/room/games/current',
      headers: authHeaders(roomDesk),
    })

    expect(response.statusCode).toBe(200)
    expect(
      parseJson<{ game: { id: number; avoidQuestionIds: number[] } }>(response).game
    ).toMatchObject({ id: CURRENT_GAME, avoidQuestionIds: [10, 11] })
  })

  describe('index sur l’e-mail normalisé', () => {
    const readIndexes = async (trx: Db) =>
      (
        (
          await trx.raw(
            'select indexname, indexdef from pg_indexes where indexname = any(?) order by indexname',
            [EMAIL_INDEXES]
          )
        ).rows as { indexname: string; indexdef: string }[]
      ).map((row) => ({ name: row.indexname, definition: row.indexdef }))

    it('existe sur lower(btrim(email)) et lower(btrim(second_email))', async () => {
      const indexes = await readIndexes(db)

      expect(indexes.map((index) => index.name)).toEqual(EMAIL_INDEXES)
      expect(indexes[0]?.definition).toContain('lower(btrim((email)::text))')
      expect(indexes[1]?.definition).toContain('lower(btrim((second_email)::text))')
    })

    it('est utilisé par la recherche des parties d’un même joueur', async () => {
      const plan = await db.transaction<string>(async (trx) => {
        await trx.raw('SET LOCAL enable_seqscan = off')

        const { rows } = await trx.raw(
          `EXPLAIN SELECT game_id FROM game_participants
           WHERE lower(btrim(email)) IN (SELECT 'lea@x.test')
           UNION
           SELECT game_id FROM game_participants
           WHERE lower(btrim(second_email)) IN (SELECT 'lea@x.test')`
        )

        return (rows as { 'QUERY PLAN': string }[]).map((row) => row['QUERY PLAN']).join(' ')
      })

      for (const name of EMAIL_INDEXES) {
        expect(plan).toContain(name)
      }
    })

    it('se défait et se rejoue à l’identique', async () => {
      const rollback = new Error('rollback voulu')
      const before = await readIndexes(db)

      await expect(
        db.transaction(async (trx) => {
          await indexMigration.down(trx as unknown as Db)
          expect(await readIndexes(trx as unknown as Db)).toEqual([])
          await indexMigration.up(trx as unknown as Db)
          expect(await readIndexes(trx as unknown as Db)).toEqual(before)
          throw rollback
        })
      ).rejects.toBe(rollback)
    })
  })
})
