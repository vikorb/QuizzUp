import path from 'node:path'

import type dbModule from '@backend/db'
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
 *     tests/backend/src/db/gameRounds.pg.test.ts
 *
 * Le `mockDb` n'applique ni les types `jsonb`, ni les index uniques, ni l'annulation d'une
 * transaction : l'écriture des manches de `POST /room/games/:id/finish` ne se prouve que sur la
 * vraie base.
 *
 * ATTENTION : utiliser une base DÉDIÉE. Les migrations Knex y sont appliquées et les tables
 * `game_rounds`, `question_themes`, `questions`, `themes`, `game_participants`, `games`, `rooms`,
 * `admins`, `companies` sont vidées avant chaque test.
 */
const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL

const TRUNCATE_TABLES =
  'TRUNCATE game_rounds, question_themes, questions, themes, game_participants, games, rooms, admins, companies RESTART IDENTITY CASCADE'

type Db = typeof dbModule

const roomDesk = { ...companyAdminUser, role: 'room', room_id: 1, sid: 'sid-room' } as TestUser

const SCORES = [{ podium: 1, score: 900 }]
const ROUNDS = [
  { position: 1, miniGame: 'quick_answer', themeId: 1, questionIds: [1, 2] },
  { position: 2, miniGame: 'sudden_death', themeId: 1, questionIds: [2] },
]

describe.skipIf(!PG_INTEGRATION_URL)('manches enregistrées à la fin de partie', () => {
  let db: Db
  let roomApp: FastifyInstance

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_INTEGRATION_URL
    db = (await import('@backend/db')).default

    await assertTestDatabase(db)
    await db.migrate.latest({ directory: path.resolve(process.cwd(), 'backend/db/migrations') })
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

    await db('companies').insert({ id: 1, name: 'Centre', email: 'c@x.test' })
    await db('admins').insert({
      id: 2,
      company_id: 1,
      role: 'admin',
      username: 'admin',
      email: 'a@x.test',
      mdp_hash: 'x',
    })
    await db('rooms').insert({ id: 1, company_id: 1, name: 'Salle 1' })
    await db('themes').insert({
      id: 1,
      admin_id: 2,
      scope: 'company',
      company_id: 1,
      name: 'Cinéma',
      mode: 'audio',
    })
    await db('questions').insert([
      { id: 1, admin_id: 2, scope: 'company', company_id: 1, question: 'Q1' },
      { id: 2, admin_id: 2, scope: 'company', company_id: 1, question: 'Q2' },
    ])
    await db('games').insert({
      id: 5,
      company_id: 1,
      room_id: 1,
      admin_id: 2,
      seed: 1,
      state: 'running',
    })
    await db('game_participants').insert({ game_id: 5, podium: 1, display_name: 'Léa' })
  })

  const finish = (payload: Record<string, unknown>) =>
    roomApp.inject({
      method: 'POST',
      url: '/room/games/5/finish',
      headers: authHeaders(roomDesk),
      payload,
    })

  const readRounds = () =>
    db('game_rounds')
      .where('game_id', 5)
      .orderBy('position')
      .select(
        'position',
        'mini_game',
        'theme_id',
        'questions',
        db.raw('jsonb_typeof(questions) as questions_type')
      )

  it('écrit les manches avec un tableau jsonb d’identifiants', async () => {
    const response = await finish({ scores: SCORES, rounds: ROUNDS })

    expect(response.statusCode).toBe(200)
    expect(await readRounds()).toEqual([
      {
        position: 1,
        mini_game: 'quick_answer',
        theme_id: 1,
        questions: [1, 2],
        questions_type: 'array',
      },
      {
        position: 2,
        mini_game: 'sudden_death',
        theme_id: 1,
        questions: [2],
        questions_type: 'array',
      },
    ])
    expect(await db('games').where('id', 5).first('state')).toEqual({ state: 'finished' })
    expect(await db('game_participants').where('game_id', 5).first('score')).toEqual({ score: 900 })
  })

  it('n’écrit les manches qu’une fois quand la fin de partie est envoyée deux fois', async () => {
    const first = await finish({ scores: SCORES, rounds: ROUNDS })
    const again = await finish({ scores: [{ podium: 1, score: 0 }], rounds: ROUNDS })

    expect(first.statusCode).toBe(200)
    expect(again.statusCode).toBe(200)
    expect(parseJson<{ game: { state: string } }>(again).game.state).toBe('finished')
    expect(await readRounds()).toHaveLength(2)
    expect(await db('game_participants').where('game_id', 5).first('score')).toEqual({ score: 900 })
  })

  it('laisse la partie en cours et les scores intacts quand l’écriture des manches échoue', async () => {
    // Une manche déjà présente pour cette position : l'index unique refuse l'insertion.
    await db('game_rounds').insert({ game_id: 5, position: 2, mini_game: 'streak' })

    const response = await finish({ scores: SCORES, rounds: ROUNDS })

    expect(response.statusCode).toBe(500)
    expect(await db('games').where('id', 5).first('state', 'finished_at')).toEqual({
      state: 'running',
      finished_at: null,
    })
    expect(await db('game_participants').where('game_id', 5).first('score')).toEqual({ score: 0 })
    expect(await readRounds()).toMatchObject([{ position: 2, mini_game: 'streak' }])
  })
})
