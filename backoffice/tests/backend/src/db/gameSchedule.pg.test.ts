import path from 'node:path'

import type dbModule from '@backend/db'
import { isExclusionViolation } from '@backend/routes/_shared/dbErrors'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { assertTestDatabase } from '../../setup/assertTestDatabase'

/**
 * Test d'intégration sur un vrai PostgreSQL : ignoré sans `PG_INTEGRATION_URL`.
 *
 *   PG_INTEGRATION_URL=postgresql://user:pass@localhost:5432/base_de_test \
 *     npx vitest run --config vitest.backend.config.ts \
 *     tests/backend/src/db/gameSchedule.pg.test.ts
 *
 * Le `mockDb` des autres tests n'applique aucune contrainte : le non-chevauchement des sessions
 * programmées (contrainte d'exclusion `btree_gist`) ne peut se prouver que sur la vraie base.
 *
 * ATTENTION : utiliser une base DÉDIÉE. Les migrations Knex y sont appliquées et les tables
 * `companies`, `admins`, `rooms`, `games` (et dépendantes) sont vidées avant chaque test.
 */
const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL

type Db = typeof dbModule

const at = (time: string) => `2027-03-10T${time}:00.000Z`

describe.skipIf(!PG_INTEGRATION_URL)('sessions programmées sur PostgreSQL', () => {
  let db: Db

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_INTEGRATION_URL
    db = (await import('@backend/db')).default

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

    await db('companies').insert({ id: 1, name: 'Centre', email: 'c@x.test' })
    await db('admins').insert({
      id: 1,
      company_id: 1,
      role: 'admin',
      username: 'admin',
      email: 'admin@x.test',
      mdp_hash: 'x',
    })
    await db('rooms').insert([
      { id: 1, company_id: 1, name: 'Salle 1' },
      { id: 2, company_id: 1, name: 'Salle 2' },
    ])
  })

  type Session = {
    room?: number
    start?: string | null
    end?: string | null
    state?: string
    status?: number
    cancelled?: boolean
  }

  /** Insère une partie ; sans `start`/`end`, c'est une partie immédiate (sans créneau). */
  function addGame({
    room = 1,
    start = null,
    end = null,
    state = 'scheduled',
    status = 1,
    cancelled = state === 'cancelled',
  }: Session) {
    return db('games')
      .insert({
        company_id: 1,
        room_id: room,
        admin_id: 1,
        seed: 1,
        state,
        status,
        deleted_at: status === 2 ? at('09:00') : null,
        cancelled_at: cancelled ? at('09:00') : null,
        scheduled_at: start,
        scheduled_end_at: end,
      })
      .returning('id')
  }

  async function exclusionError(promise: PromiseLike<unknown>) {
    try {
      await promise
    } catch (error) {
      return error as { code?: string; constraint?: string }
    }

    return null
  }

  it('refuse deux sessions qui se chevauchent dans la même salle (23P01)', async () => {
    await addGame({ start: at('10:00'), end: at('11:00') })

    const error = await exclusionError(addGame({ start: at('10:30'), end: at('11:30') }))

    expect(isExclusionViolation(error)).toBe(true)
    expect(error?.constraint).toBe('games_room_schedule_no_overlap')
  })

  it('refuse une session contenue dans une autre, et une session qui en englobe une', async () => {
    await addGame({ start: at('10:00'), end: at('12:00') })

    expect(
      isExclusionViolation(await exclusionError(addGame({ start: at('10:30'), end: at('11:00') })))
    ).toBe(true)
    expect(
      isExclusionViolation(await exclusionError(addGame({ start: at('09:00'), end: at('13:00') })))
    ).toBe(true)
  })

  it('accepte deux sessions bout à bout (intervalle semi-ouvert)', async () => {
    await addGame({ start: at('10:00'), end: at('11:00') })

    await expect(addGame({ start: at('11:00'), end: at('12:00') })).resolves.toHaveLength(1)
    await expect(addGame({ start: at('09:00'), end: at('10:00') })).resolves.toHaveLength(1)
  })

  it('accepte le même créneau dans deux salles différentes', async () => {
    await addGame({ room: 1, start: at('10:00'), end: at('11:00') })

    await expect(addGame({ room: 2, start: at('10:00'), end: at('11:00') })).resolves.toHaveLength(
      1
    )
  })

  it('une session ouverte (pending) ou en cours (running) garde son créneau', async () => {
    await addGame({ start: at('10:00'), end: at('11:00'), state: 'pending' })
    await addGame({ room: 2, start: at('10:00'), end: at('11:00'), state: 'running' })

    expect(
      isExclusionViolation(await exclusionError(addGame({ start: at('10:30'), end: at('11:30') })))
    ).toBe(true)
    expect(
      isExclusionViolation(
        await exclusionError(addGame({ room: 2, start: at('10:30'), end: at('11:30') }))
      )
    ).toBe(true)
  })

  it('une session annulée libère son créneau, à la création comme à la mise à jour', async () => {
    await addGame({ start: at('10:00'), end: at('11:00'), state: 'cancelled' })
    await expect(addGame({ start: at('10:00'), end: at('11:00') })).resolves.toHaveLength(1)

    await db('games')
      .where({ state: 'scheduled' })
      .update({ state: 'cancelled', cancelled_at: at('09:00') })
    await expect(addGame({ start: at('10:30'), end: at('11:30') })).resolves.toHaveLength(1)
  })

  it.each(['finished', 'aborted'])('une session %s libère son créneau', async (state) => {
    await addGame({ start: at('10:00'), end: at('11:00'), state })

    await expect(addGame({ start: at('10:00'), end: at('11:00') })).resolves.toHaveLength(1)
  })

  it('une session supprimée logiquement (status 2) libère son créneau', async () => {
    await addGame({ start: at('10:00'), end: at('11:00'), status: 2 })

    await expect(addGame({ start: at('10:00'), end: at('11:00') })).resolves.toHaveLength(1)
  })

  it('refuse de remettre en jeu une session annulée sur un créneau repris', async () => {
    const [{ id }] = await addGame({ start: at('10:00'), end: at('11:00'), state: 'cancelled' })
    await addGame({ start: at('10:00'), end: at('11:00') })

    const error = await exclusionError(
      db('games').where({ id }).update({ state: 'scheduled', cancelled_at: null })
    )

    expect(isExclusionViolation(error)).toBe(true)
  })

  it('ignore les parties sans créneau (scheduled_at nul), même nombreuses dans une salle', async () => {
    await addGame({ state: 'finished' })
    await addGame({ state: 'finished' })
    await addGame({ state: 'pending' })
    // Une partie immédiate en attente ne bloque pas une session programmée de la même salle.
    await expect(addGame({ start: at('10:00'), end: at('11:00') })).resolves.toHaveLength(1)
  })

  it('refuse une session programmée dont les bornes sont incohérentes (CHECK)', async () => {
    // Fin avant le début, ou une seule borne : jamais un intervalle infini.
    await expect(addGame({ start: at('11:00'), end: at('10:00') })).rejects.toMatchObject({
      code: '23514',
    })
    await expect(addGame({ start: at('11:00'), end: at('11:00') })).rejects.toMatchObject({
      code: '23514',
    })
    await expect(addGame({ start: at('11:00'), end: null })).rejects.toMatchObject({
      code: '23514',
    })
    await expect(addGame({ start: null, end: at('11:00') })).rejects.toMatchObject({
      code: '23514',
    })
    // Un état `scheduled` exige un créneau.
    await expect(addGame({ state: 'scheduled' })).rejects.toMatchObject({ code: '23514' })
  })

  it('exige cancelled_at si et seulement si la session est annulée (CHECK)', async () => {
    await expect(
      addGame({ start: at('10:00'), end: at('11:00'), state: 'cancelled', cancelled: false })
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      addGame({ start: at('10:00'), end: at('11:00'), state: 'scheduled', cancelled: true })
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('borne les joueurs, la langue et la référence externe', async () => {
    const insert = (extra: Record<string, unknown>) =>
      db('games').insert({
        company_id: 1,
        room_id: 1,
        admin_id: 1,
        seed: 1,
        state: 'finished',
        ...extra,
      })

    await expect(
      insert({ players_count: 12, locale: 'en', external_ref: 'x'.repeat(100) })
    ).resolves.toBeDefined()
    await expect(insert({ players_count: 13 })).rejects.toMatchObject({ code: '23514' })
    await expect(insert({ players_count: 0 })).rejects.toMatchObject({ code: '23514' })
    await expect(insert({ locale: 'de' })).rejects.toMatchObject({ code: '23514' })
    await expect(insert({ external_ref: 'x'.repeat(101) })).rejects.toBeDefined()
  })

  it('range les réglages de créneaux de la salle dans rooms.schedule (nul par défaut)', async () => {
    expect((await db('rooms').where({ id: 1 }).first()).schedule).toBeNull()

    await db('rooms')
      .where({ id: 1 })
      .update({ schedule: JSON.stringify({ timezone: 'Europe/Paris' }) })

    expect((await db('rooms').where({ id: 1 }).first()).schedule).toEqual({
      timezone: 'Europe/Paris',
    })
  })

  describe('retour arrière de la migration (down)', () => {
    const migration = {
      directory: path.resolve(process.cwd(), 'backend/db/migrations'),
      name: '20261124000000_add_game_scheduling.js',
    }

    // Quoi qu'il arrive, la base de test doit retrouver le schéma à jour pour les tests suivants.
    afterEach(async () => {
      await db.migrate.latest({ directory: migration.directory })
    })

    it('refuse tant qu’une partie est programmée, puis passe sur une base vide et se rejoue', async () => {
      await addGame({ start: at('10:00'), end: at('11:00') })

      await expect(db.migrate.down(migration)).rejects.toThrow(/Rollback impossible/)
      // Refus : le schéma n'a pas bougé, la ligne est toujours là.
      expect(await db.schema.hasColumn('games', 'scheduled_at')).toBe(true)
      expect(await db('games').where({ state: 'scheduled' })).toHaveLength(1)

      await db('games').delete()
      await db.migrate.down(migration)

      expect(await db.schema.hasColumn('games', 'scheduled_at')).toBe(false)
      expect(await db.schema.hasColumn('rooms', 'schedule')).toBe(false)
      // L'ancien CHECK est revenu : `scheduled` n'est plus un état connu.
      await expect(
        db('games').insert({
          company_id: 1,
          room_id: 1,
          admin_id: 1,
          seed: 1,
          state: 'scheduled',
        })
      ).rejects.toMatchObject({ code: '23514' })

      await db.migrate.latest({ directory: migration.directory })

      await expect(addGame({ start: at('10:00'), end: at('11:00') })).resolves.toHaveLength(1)
    })

    it('refuse aussi tant qu’une salle a des réglages de créneaux', async () => {
      await db('rooms')
        .where({ id: 1 })
        .update({ schedule: JSON.stringify({ timezone: 'Europe/Paris' }) })

      await expect(db.migrate.down(migration)).rejects.toThrow(/rooms\.schedule/)
      expect(await db.schema.hasColumn('rooms', 'schedule')).toBe(true)
    })
  })
})
