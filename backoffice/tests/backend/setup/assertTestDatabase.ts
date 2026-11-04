/**
 * Garde-fou des tests PostgreSQL (`*.pg.test.ts`), qui appliquent les migrations et lancent des
 * TRUNCATE : à appeler AVANT tout cela. Refuse toute base dont le nom (relu côté serveur, pas
 * déduit de l'URL) ne finit pas par `_test`, pour ne jamais vider une base de dev ou de recette.
 */
export const TEST_DATABASE_SUFFIX = '_test'

export function isTestDatabaseName(name: string): boolean {
  return name.endsWith(TEST_DATABASE_SUFFIX)
}

type RawRunner = { raw: (sql: string) => PromiseLike<{ rows: { current_database: string }[] }> }

export async function assertTestDatabase(db: RawRunner): Promise<void> {
  const { rows } = await db.raw('select current_database()')
  const name = rows[0].current_database

  if (!isTestDatabaseName(name)) {
    throw new Error(
      `Test PostgreSQL refusé : la base "${name}" ne finit pas par "${TEST_DATABASE_SUFFIX}". ` +
        'Utiliser une base DÉDIÉE (ex. quizzup_purge_test), jamais une base de dev ou de recette.'
    )
  }
}
