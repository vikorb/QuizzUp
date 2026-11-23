import path from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { assertTestDatabase } from '../../../setup/assertTestDatabase'
import { authHeaders, createRouteApp, type TestUser } from '../_helpers/testApp'

/**
 * Atomicité de l'import CSV sur un vrai PostgreSQL : ignoré sans `PG_INTEGRATION_URL`
 * (base DÉDIÉE dont le nom finit par `_test`, cf. purgePlayerEmails.pg.test.ts).
 *
 * Aucun import statique de `@backend/*` : `db.ts` lit `DATABASE_URL` à l'import.
 */
const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL
if (PG_INTEGRATION_URL) process.env.DATABASE_URL = PG_INTEGRATION_URL

type Db = typeof import('@backend/db').default

const HEADER = 'theme;question;answer_1;answer_2;correct'
const COMPANY_ADMIN: TestUser = {
  sub: '52',
  id: 52,
  adminId: 52,
  company_id: 10,
  companyId: 10,
  role: 'admin',
  sid: 'sid-admin10',
}

describe.skipIf(!PG_INTEGRATION_URL)('import CSV de questions sur PostgreSQL', () => {
  let db: Db
  let routes: unknown

  beforeAll(async () => {
    db = (await import('@backend/db')).default
    routes = (await import('@backend/routes/questions')).default

    await assertTestDatabase(db)
    await db.migrate.latest({ directory: path.resolve(process.cwd(), 'backend/db/migrations') })
  }, 120_000)

  afterAll(async () => {
    await db?.destroy()
  })

  beforeEach(async () => {
    await db.raw(
      'TRUNCATE question_themes, answers, questions, themes, admins, companies RESTART IDENTITY CASCADE'
    )
    await db('companies').insert([
      { id: 10, name: 'Centre 10', email: 'c10@x.test' },
      { id: 11, name: 'Centre 11', email: 'c11@x.test' },
    ])
    await db('admins').insert({
      id: 52,
      company_id: 10,
      role: 'admin',
      username: 'admin10',
      email: 'admin10@x.test',
      mdp_hash: 'x',
    })
    const theme = { mode: 'classic', scope: 'company', admin_id: 52 }
    await db('themes').insert([
      { ...theme, name: 'Mon thème', company_id: 10 },
      { ...theme, name: 'Thème voisin', company_id: 11 },
    ])
  })

  async function importCsv(...lines: string[]) {
    const app = await createRouteApp(routes)

    try {
      return await app.inject({
        method: 'POST',
        url: '/questions/import',
        headers: { ...authHeaders(COMPANY_ADMIN), 'content-type': 'text/csv' },
        payload: [HEADER, ...lines].join('\n'),
      })
    } finally {
      await app.close()
    }
  }

  async function counts() {
    const count = async (table: string) => Number((await db(table).count('* as n'))[0]!.n)

    return {
      questions: await count('questions'),
      question_themes: await count('question_themes'),
      answers: await count('answers'),
    }
  }

  it('writes the questions, their theme links and their answers for the admin company', async () => {
    const response = await importCsv(
      'Mon thème;Première ?;Oui;Non;1',
      'Mon thème;Deuxième ?;Oui;Non;2'
    )

    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual({ created: 2 })
    expect(await counts()).toEqual({ questions: 2, question_themes: 2, answers: 4 })
    expect(await db('questions').select('scope', 'company_id', 'admin_id')).toEqual([
      { scope: 'company', company_id: 10, admin_id: 52 },
      { scope: 'company', company_id: 10, admin_id: 52 },
    ])
  })

  it('rolls everything back when the database refuses a row after earlier ones were written', async () => {
    // Un déclencheur de test fait refuser par PostgreSQL la troisième question, qui passe toutes
    // les règles du fichier : les deux premières, déjà écrites dans la transaction, doivent partir.
    await db.raw(`
      CREATE OR REPLACE FUNCTION import_test_refuse_third() RETURNS trigger AS $$
      BEGIN
        IF NEW.question LIKE 'Troisi%' THEN
          RAISE EXCEPTION 'insertion refusee par le test';
        END IF;
        RETURN NEW;
      END
      $$ LANGUAGE plpgsql
    `)
    await db.raw(
      'CREATE TRIGGER import_test_refuse_third BEFORE INSERT ON questions FOR EACH ROW EXECUTE FUNCTION import_test_refuse_third()'
    )

    try {
      const response = await importCsv(
        'Mon thème;Première ?;Oui;Non;1',
        'Mon thème;Deuxième ?;Oui;Non;1',
        'Mon thème;Troisième ?;Oui;Non;1'
      )

      expect(response.statusCode).toBe(500)
      expect(await counts()).toEqual({ questions: 0, question_themes: 0, answers: 0 })
    } finally {
      await db.raw('DROP TRIGGER IF EXISTS import_test_refuse_third ON questions')
      await db.raw('DROP FUNCTION IF EXISTS import_test_refuse_third()')
    }
  })

  it('does not reach the theme of another company', async () => {
    const response = await importCsv('Thème voisin;Chez le voisin ?;Oui;Non;1')

    expect(response.statusCode).toBe(422)
    expect(await counts()).toEqual({ questions: 0, question_themes: 0, answers: 0 })
  })
})
