import { setAuthenticatedSuperadmin } from '@frontend-tests/_helpers/authStateMock'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { describe, expect, it, vi } from 'vitest'

import { router } from '@/router'

// Espace centre : l'alias `@surface` désigne le module du centre, sans écran de console.
vi.mock('@surface', async () => await import('@/surface/centre'))

resetFrontendMocksBeforeEach()

describe('router (surface centre)', () => {
  it('has no clients list, and resolves /clients to the home page', async () => {
    setAuthenticatedSuperadmin()

    expect(router.hasRoute('clients')).toBe(false)

    await router.push('/clients')

    expect(router.currentRoute.value.name).toBe('home')
  })
})
