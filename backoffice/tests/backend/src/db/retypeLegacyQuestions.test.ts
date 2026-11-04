import { createRequire } from 'node:module'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getQuestionKindAnswersError } from '@quizzup/shared'

/**
 * Migration de données `retype_legacy_questions` : la règle de déduction (copiée du moteur de
 * jeu) est testée sans base ; le test PostgreSQL (`PG_INTEGRATION_URL`, base DÉDIÉE, cf.
 * purgePlayerEmails.pg.test.ts) joue `up` puis `down` dans une transaction annulée.
 */
const require = createRequire(import.meta.url)
const migration = require(
  path.resolve(process.cwd(), 'backend/db/migrations/20261104050000_retype_legacy_questions.js')
) as {
  inferKind: (answers: { response: string; is_correct: boolean }[]) => string
  up: (knex: Db) => Promise<void>
  down: (knex: Db) => Promise<void>
}

function answers(correct: number, ...responses: string[]) {
  return responses.map((response, index) => ({ response, is_correct: index === correct }))
}

describe('inferKind (règle du moteur appliquée à l’ancien contenu)', () => {
  it.each([
    [answers(0, 'Vrai', 'Faux'), 'true_false'],
    [answers(1, 'vrai', 'FAUX'), 'true_false'],
    [answers(0, 'Faux', 'Vrai'), 'true_false'],
    [answers(0, 'Entre 10 et 20', 'Entre 20 et 30', 'Plus de 30'), 'estimate'],
    [answers(1, 'Moins de 5', 'Entre 5 et 10', 'Plus de 10', 'Plus de 100'), 'estimate'],
    [answers(0, '10-20', '20-30', '30-40'), 'estimate'],
  ])('%j -> %s', (given, expected) => {
    expect(migration.inferKind(given)).toBe(expected)
  })

  it.each([
    ['QCM classique', answers(0, 'Paris', 'Lyon', 'Nice', 'Lille')],
    ['nombres isolés', answers(0, '4', '6', '7', '12')],
    ['scores', answers(0, '3-0', '2-1', '1-1')],
    ['noms avec nombre', answers(0, 'Henri 4', 'Louis 14', 'Louis 16')],
    [
      'vrai/faux sans bonne réponse unique',
      [
        { response: 'Vrai', is_correct: true },
        { response: 'Faux', is_correct: true },
      ],
    ],
    ['vrai seul', answers(0, 'Vrai', 'Peut-être')],
    [
      'fourchettes à 5 réponses',
      answers(0, 'Moins de 1', 'Entre 1 et 2', 'Entre 2 et 3', 'Entre 3 et 4', 'Plus de 4'),
    ],
    ['fourchettes à 2 réponses', answers(0, 'Moins de 10', 'Plus de 10')],
    [
      'fourchettes sans bonne réponse',
      [
        { response: 'Moins de 10', is_correct: false },
        { response: 'Entre 10 et 20', is_correct: false },
        { response: 'Plus de 20', is_correct: false },
      ],
    ],
  ])('reste un QCM : %s', (_label, given) => {
    expect(migration.inferKind(given)).toBe('qcm')
  })

  it('ne retype que ce que le backoffice accepterait à l’enregistrement', () => {
    for (const given of [
      answers(0, 'Vrai', 'Faux'),
      answers(0, 'Entre 10 et 20', 'Entre 20 et 30', 'Plus de 30'),
      answers(0, '10-20', '20-30', '30-40'),
    ]) {
      const kind = migration.inferKind(given) as 'true_false' | 'estimate'
      const shared = given.map(({ response, is_correct }) => ({ response, isCorrect: is_correct }))

      expect(getQuestionKindAnswersError(kind, shared)).toBeNull()
    }
  })
})

const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL

type Db = typeof import('@backend/db').default

describe.skipIf(!PG_INTEGRATION_URL)('retype_legacy_questions sur PostgreSQL', () => {
  let db: Db

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_INTEGRATION_URL
    db = (await import('@backend/db')).default
    // Les fichiers pg.test migrent la même base en parallèle : sur une base vide, la création
    // de la table de verrou de Knex peut entrer en conflit. On réessaie, l'autre a fini entre-temps.
    for (let attempt = 1; ; attempt++) {
      try {
        await db.migrate.latest({ directory: path.resolve(process.cwd(), 'backend/db/migrations') })
        break
      } catch (error) {
        if (attempt === 5) throw error
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }
  }, 120_000)

  afterAll(async () => {
    await db?.destroy()
  })

  const ROLLBACK = new Error('rollback voulu')

  /** Insère une question `qcm` et ses réponses ; renvoie son id. */
  async function addQuestion(
    trx: Db,
    base: { admin_id: number },
    question: {
      scope?: 'global' | 'company'
      company_id?: number | null
      status?: number
      type_media?: string
      answers: { response: string; is_correct: boolean; status?: number }[]
    }
  ): Promise<number> {
    const status = question.status ?? 1
    const [created] = await trx('questions')
      .insert({
        admin_id: base.admin_id,
        scope: question.scope ?? 'company',
        company_id: question.scope === 'global' ? null : (question.company_id ?? 901),
        question: 'Question ?',
        type_media: question.type_media ?? 'none',
        status,
        deleted_at: status === 2 ? trx.fn.now() : null,
      })
      .returning('id')

    for (const answer of question.answers) {
      await trx('answers').insert({
        admin_id: base.admin_id,
        question_id: created.id,
        response: answer.response,
        is_correct: answer.is_correct,
        status: answer.status ?? status,
        deleted_at: (answer.status ?? status) === 2 ? trx.fn.now() : null,
      })
    }

    return Number(created.id)
  }

  it('retype vrai/faux et estimation (tous périmètres), laisse le reste, et down est exact', async () => {
    const kinds = async (trx: Db, ids: number[]) =>
      Object.fromEntries(
        (await trx('questions').whereIn('id', ids).select('id', 'kind')).map((row) => [
          Number(row.id),
          row.kind as string,
        ])
      )

    await expect(
      db.transaction(async (trx) => {
        await migration.down(trx) // état d'avant la migration (table de trace supprimée)

        await trx('companies').insert({ id: 901, name: 'Retype', email: 'retype@x.test' })
        const [admin] = await trx('admins')
          .insert({
            id: 9901,
            company_id: 901,
            role: 'admin',
            username: 'retype',
            email: 'r@x.test',
            mdp_hash: 'x',
          })
          .returning('id')
        const base = { admin_id: Number(admin.id) }

        const trueFalse = await addQuestion(trx, base, {
          answers: [
            { response: 'Vrai', is_correct: true },
            { response: 'Faux', is_correct: false },
          ],
        })
        const estimateGlobal = await addQuestion(trx, base, {
          scope: 'global',
          answers: [
            { response: 'Moins de 10', is_correct: false },
            { response: 'Entre 10 et 20', is_correct: true },
            { response: 'Plus de 20', is_correct: false },
          ],
        })
        const draft = await addQuestion(trx, base, {
          status: 3,
          answers: [
            { response: 'vrai', is_correct: false },
            { response: 'faux', is_correct: true },
          ],
        })
        const qcm = await addQuestion(trx, base, {
          answers: ['Paris', 'Lyon', 'Nice'].map((response, i) => ({
            response,
            is_correct: i === 0,
          })),
        })
        const deleted = await addQuestion(trx, base, {
          status: 2,
          answers: [
            { response: 'Vrai', is_correct: true },
            { response: 'Faux', is_correct: false },
          ],
        })
        const withImage = await addQuestion(trx, base, {
          type_media: 'image',
          answers: [
            { response: 'Vrai', is_correct: true },
            { response: 'Faux', is_correct: false },
          ],
        })
        // Une réponse supprimée ne compte pas : 2 actives « Vrai/Faux » + 1 supprimée = vrai/faux.
        const withDeletedAnswer = await addQuestion(trx, base, {
          answers: [
            { response: 'Vrai', is_correct: true },
            { response: 'Faux', is_correct: false },
            { response: 'Autre', is_correct: false, status: 2 },
          ],
        })
        const ids = [trueFalse, estimateGlobal, draft, qcm, deleted, withImage, withDeletedAnswer]
        const before = await kinds(trx, ids)
        expect(Object.values(before).every((kind) => kind === 'qcm')).toBe(true)

        await migration.up(trx)

        expect(await kinds(trx, ids)).toEqual({
          [trueFalse]: 'true_false',
          [estimateGlobal]: 'estimate',
          [draft]: 'true_false',
          [qcm]: 'qcm',
          [deleted]: 'qcm',
          [withImage]: 'qcm',
          [withDeletedAnswer]: 'true_false',
        })

        // Une question créée vrai/faux après coup n'est pas touchée par le retour arrière.
        const manual = await addQuestion(trx, base, {
          answers: [
            { response: 'Vrai', is_correct: true },
            { response: 'Faux', is_correct: false },
          ],
        })
        await trx('questions').where({ id: manual }).update({ kind: 'true_false' })

        await migration.down(trx)

        expect(await kinds(trx, [...ids, manual])).toEqual({
          ...before,
          [manual]: 'true_false',
        })

        throw ROLLBACK
      })
    ).rejects.toBe(ROLLBACK)
  })
})
