import { afterEach, describe, expect, it, vi } from 'vitest'

describe('db — configuration de knex', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('ne recopie pas les valeurs d’une requête en échec dans le message d’erreur', async () => {
    // Aucune connexion n'est ouverte : knex ne se connecte qu'à la première requête.
    vi.stubEnv('DATABASE_URL', 'postgresql://user:password@localhost:1/base')
    const { default: db } = await import('@backend/db')

    expect(db.client.config.compileSqlOnError).toBe(false)

    await db.destroy()
  })
})
