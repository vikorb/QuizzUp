import { createRequire } from 'node:module'
import path from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { assertTestDatabase } from '../../setup/assertTestDatabase'

/**
 * Migration `add_playlist_to_themes` sur PostgreSQL (`PG_INTEGRATION_URL`, base DÉDIÉE dont le nom
 * finit par `_test`) : `up` est joué par `migrate.latest`, contraintes vérifiées dans des
 * transactions annulées, `down` puis `up` dans une transaction annulée, puis le `down` réel (refus
 * tant qu'un thème utilise une playlist).
 */
const require = createRequire(import.meta.url)
const migration = require(
  path.resolve(process.cwd(), 'backend/db/migrations/20261124130000_add_playlist_to_themes.js')
) as {
  up: (knex: Db) => Promise<void>
  down: (knex: Db) => Promise<void>
}

const PG_INTEGRATION_URL = process.env.PG_INTEGRATION_URL

type Db = typeof import('@backend/db').default

const PLAYLIST_COLUMNS = ['playlist_provider', 'playlist_ref']

describe.skipIf(!PG_INTEGRATION_URL)('add_playlist_to_themes sur PostgreSQL', () => {
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

  // Base partagée avec les autres fichiers `*.pg.test.ts` : on ne dépend pas de ce qu'ils laissent.
  beforeEach(async () => {
    await db.raw('TRUNCATE admins, companies RESTART IDENTITY CASCADE')
    await db('companies').insert({ id: 922, name: 'Playlists', email: 'playlists@x.test' })
    await db('admins').insert({
      id: 9922,
      company_id: 922,
      role: 'admin',
      username: 'playlists',
      email: 'p@x.test',
      mdp_hash: 'x',
    })
  })

  const ROLLBACK = new Error('rollback voulu')

  async function playlistColumns(trx: Db) {
    const { rows } = await trx.raw(
      `select column_name, data_type, character_maximum_length, is_nullable
         from information_schema.columns
        where table_name = 'themes' and column_name = any(?)
        order by column_name`,
      [PLAYLIST_COLUMNS]
    )

    return rows as {
      column_name: string
      data_type: string
      character_maximum_length: number | null
      is_nullable: string
    }[]
  }

  function insertTheme(trx: Db, overrides: Record<string, unknown> = {}) {
    return trx('themes').insert({
      admin_id: 9922,
      scope: 'company',
      company_id: 922,
      name: 'Rock',
      mode: 'audio',
      ...overrides,
    })
  }

  /** La contrainte refuse l'écriture ; la transaction est annulée dans tous les cas. */
  async function expectRefused(overrides: Record<string, unknown>, constraint: string) {
    await expect(
      db.transaction(async (trx) => {
        await insertTheme(trx, overrides)
        throw ROLLBACK
      })
    ).rejects.toThrow(constraint)
  }

  /** L'écriture passe ; la transaction est annulée pour ne rien laisser derrière. */
  async function expectAccepted(overrides: Record<string, unknown>) {
    await expect(
      db.transaction(async (trx) => {
        await insertTheme(trx, overrides)
        throw ROLLBACK
      })
    ).rejects.toBe(ROLLBACK)
  }

  it('adds two nullable varchar columns, empty for an existing theme', async () => {
    await expect(
      db.transaction(async (trx) => {
        expect(await playlistColumns(trx)).toEqual([
          {
            column_name: 'playlist_provider',
            data_type: 'character varying',
            character_maximum_length: 20,
            is_nullable: 'YES',
          },
          {
            column_name: 'playlist_ref',
            data_type: 'character varying',
            character_maximum_length: 64,
            is_nullable: 'YES',
          },
        ])

        const [created] = await insertTheme(trx).returning('id')

        expect(
          await trx('themes').where({ id: created.id }).first('playlist_provider', 'playlist_ref')
        ).toEqual({ playlist_provider: null, playlist_ref: null })

        throw ROLLBACK
      })
    ).rejects.toBe(ROLLBACK)
  })

  it('accepts a known provider with a numeric ref on an audio theme, or neither', async () => {
    await expectAccepted({ playlist_provider: 'deezer', playlist_ref: '908622995' })
    await expectAccepted({ playlist_provider: 'deezer', playlist_ref: '1'.repeat(20) })
    await expectAccepted({ playlist_provider: null, playlist_ref: null })
    await expectAccepted({ mode: 'classic' })
  })

  it('refuses a provider that is not in the list', async () => {
    await expectRefused(
      { playlist_provider: 'spotify', playlist_ref: '1' },
      'themes_playlist_provider_check'
    )
  })

  it.each(['abc', '12a', '', ' 12', '12\n', '-3', '1.5', '1'.repeat(21)])(
    'refuses the ref %j',
    async (playlistRef) => {
      await expectRefused(
        { playlist_provider: 'deezer', playlist_ref: playlistRef },
        'themes_playlist_ref_check'
      )
    }
  )

  it('refuses a provider without a ref, and a ref without a provider', async () => {
    await expectRefused(
      { playlist_provider: 'deezer', playlist_ref: null },
      'themes_playlist_pair_check'
    )
    await expectRefused(
      { playlist_provider: null, playlist_ref: '1' },
      'themes_playlist_pair_check'
    )
  })

  it.each(['classic', 'image', 'mixed'])('refuses a playlist on a %s theme', async (mode) => {
    await expectRefused(
      { mode, playlist_provider: 'deezer', playlist_ref: '1' },
      'themes_playlist_audio_check'
    )
  })

  it('refuses to leave the audio mode while a playlist is set', async () => {
    await expect(
      db.transaction(async (trx) => {
        const [created] = await insertTheme(trx, {
          playlist_provider: 'deezer',
          playlist_ref: '1',
        }).returning('id')

        await trx('themes').where({ id: created.id }).update({ mode: 'classic' })
      })
    ).rejects.toThrow('themes_playlist_audio_check')
  })

  it('down removes the columns and their constraints, and up brings them back', async () => {
    await expect(
      db.transaction(async (trx) => {
        await migration.down(trx)
        expect(await playlistColumns(trx)).toEqual([])

        await migration.up(trx)
        expect((await playlistColumns(trx)).map((column) => column.column_name)).toEqual(
          PLAYLIST_COLUMNS
        )

        throw ROLLBACK
      })
    ).rejects.toBe(ROLLBACK)

    // Le retour arrière annulé ne touche pas à la base réelle.
    expect(await playlistColumns(db)).toHaveLength(2)
  })

  describe('retour arrière réel de la migration (down)', () => {
    const rollback = {
      directory: path.resolve(process.cwd(), 'backend/db/migrations'),
      name: '20261124130000_add_playlist_to_themes.js',
    }

    // Quoi qu'il arrive, la base de test doit retrouver le schéma à jour pour les tests suivants.
    afterEach(async () => {
      await db.migrate.latest({ directory: rollback.directory })
    })

    it('refuse tant qu’un thème utilise une playlist, puis passe une fois retirée', async () => {
      await insertTheme(db, { id: 932, playlist_provider: 'deezer', playlist_ref: '42' })

      await expect(db.migrate.down(rollback)).rejects.toThrow(
        /Rollback impossible : des thèmes utilisent une playlist de fournisseur/
      )
      // Refus : le schéma n'a pas bougé, la référence est toujours là.
      expect(await playlistColumns(db)).toHaveLength(2)
      expect((await db('themes').where({ id: 932 }).first('playlist_ref')).playlist_ref).toBe('42')

      await db('themes').where({ id: 932 }).update({ playlist_provider: null, playlist_ref: null })
      await db.migrate.down(rollback)

      expect(await playlistColumns(db)).toEqual([])

      await db.migrate.latest({ directory: rollback.directory })

      expect(await playlistColumns(db)).toHaveLength(2)
    })
  })
})
