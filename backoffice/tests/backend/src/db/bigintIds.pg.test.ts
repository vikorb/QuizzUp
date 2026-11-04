import { createRequire } from 'node:module'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { assertTestDatabase } from '../../setup/assertTestDatabase'

/**
 * Régression A0 (recette Docker) : `pg` renvoie les bigint (ids, `company_id`) en chaîne, donc
 * `"10" === 10` (JWT / session) était faux et un admin de compagnie recevait 403 sur ses propres
 * thèmes. Le correctif est dans `backend/src/db.ts` (parseur int8 -> nombre).
 *
 * - Test sans base : le parseur int8 est bien posé à l'import de `db.ts`.
 * - Test PostgreSQL (`PG_INTEGRATION_URL`, base DÉDIÉE, cf. purgePlayerEmails.pg.test.ts) :
 *   la ligne SQL relue donne un `company_id` numérique et les gardes de portée l'acceptent.
 *
 * Aucun import statique de `@backend/*` : `db.ts` lit `DATABASE_URL` à l'import, il faut donc
 * le fixer avant (sinon les migrations et le TRUNCATE partiraient sur la base du `.env.example`).
 */
const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL
if (PG_INTEGRATION_URL) process.env.DATABASE_URL = PG_INTEGRATION_URL

// `pg` n'est installé que dans backend/ : on le résout depuis ce paquet (même instance que knex).
const { types } = createRequire(path.resolve(process.cwd(), 'backend/package.json'))('pg') as {
  types: { getTypeParser: (oid: number) => (value: string) => unknown }
}

describe('parseur int8 de pg', () => {
  it('lit un bigint en nombre, pas en chaîne', async () => {
    await import('@backend/db')

    expect(types.getTypeParser(20)('10')).toBe(10)
  })
})

type Db = typeof import('@backend/db').default
type Scope = typeof import('@backend/routes/_shared/scope')
type Req = Parameters<Scope['canReadScoped']>[1]
type Questions = typeof import('@backend/routes/questions/_shared')

function reqOfCompany(companyId: number, role = 'admin') {
  return { user: { role, company_id: companyId } } as unknown as Req
}

describe.skipIf(!PG_INTEGRATION_URL)('portée company_id sur PostgreSQL', () => {
  let db: Db
  let scope: Scope
  let questions: Questions
  let ownThemeId: number
  let otherThemeId: number
  let getThemeAccessRow: typeof import('@backend/routes/themes/_shared').getThemeAccessRow

  beforeAll(async () => {
    db = (await import('@backend/db')).default
    scope = await import('@backend/routes/_shared/scope')
    questions = await import('@backend/routes/questions/_shared')
    getThemeAccessRow = (await import('@backend/routes/themes/_shared')).getThemeAccessRow

    await assertTestDatabase(db)
    await db.migrate.latest({ directory: path.resolve(process.cwd(), 'backend/db/migrations') })
    await db.raw('TRUNCATE themes, admins, companies RESTART IDENTITY CASCADE')

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
    ;[{ id: ownThemeId }] = await db('themes')
      .insert({ ...theme, name: 'Mon thème', company_id: 10 })
      .returning('id')
    ;[{ id: otherThemeId }] = await db('themes')
      .insert({ ...theme, name: 'Autre thème', company_id: 11 })
      .returning('id')
  }, 120_000)

  afterAll(async () => {
    await db?.destroy()
  })

  it('un admin de compagnie lit et modifie le thème de sa compagnie, pas celui d’une autre', async () => {
    const own = await getThemeAccessRow(ownThemeId)
    const other = await getThemeAccessRow(otherThemeId)

    expect(typeof own?.company_id).toBe('number')
    expect(scope.canReadScoped(own!, reqOfCompany(10))).toBe(true)
    expect(scope.canEditScoped(own!, reqOfCompany(10))).toBe(true)
    expect(scope.canReadScoped(other!, reqOfCompany(10))).toBe(false)
    expect(scope.canEditScoped(other!, reqOfCompany(10))).toBe(false)
  })

  // Chemin de création d'une question (canReadTheme + isThemeCompatibleWithQuestion).
  it('un admin de compagnie peut rattacher une question à son thème, pas à celui d’une autre', async () => {
    const usable = (themeId: number, role = 'admin') =>
      questions.ensureThemeIsUsable(themeId, reqOfCompany(10, role), 'company', 10)
    expect(await usable(ownThemeId)).toBeNull()
    expect(await usable(otherThemeId)).toBe('question_theme_forbidden')
    // Superadmin : la lecture passe, seule la compatibilité thème / question tranche.
    expect(await usable(ownThemeId, 'superadmin')).toBeNull()
    expect(await usable(otherThemeId, 'superadmin')).toBe('question_theme_scope_mismatch')
  })
})
