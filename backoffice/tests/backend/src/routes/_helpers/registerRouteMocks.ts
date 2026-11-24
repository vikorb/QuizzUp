import './registerDbMock'

import { vi } from 'vitest'

vi.mock('../../../../../backend/src/security/requireApiPermission', async () => {
  const { requireApiPermissionMock } = await import('./mockSecurity')

  return {
    requireApiPermission: requireApiPermissionMock,
  }
})

vi.mock('../../../../../backend/src/security/companiesPolicy', async () => {
  const { companiesPolicyMock } = await import('./mockSecurity')

  return companiesPolicyMock
})

// La requête des questions déjà vues est du SQL propre à PostgreSQL (`room.avoidQuestions.pg.test.ts`) :
// les tests de routes du `mockDb` n'en voient que le résultat, vide par défaut.
vi.mock('../../../../../backend/src/routes/room/_history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../backend/src/routes/room/_history')>()),
  findAvoidQuestionIds: vi.fn(async () => []),
}))
