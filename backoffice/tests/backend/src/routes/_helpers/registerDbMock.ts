import { vi } from 'vitest'

// Enregistrement unique du mock de la connexion Knex (`backend/src/db`) : il remplace la
// base réelle par la base en mémoire (mockDb). Importé par `registerRouteMocks` (tous les
// tests de route) et par le test du plugin auth, pour n'avoir qu'une seule source.
vi.mock('../../../../../backend/src/db', async () => {
  const { db } = await import('./mockDb')

  return { default: db }
})
