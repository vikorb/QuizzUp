import { setAuthenticatedSuperadmin } from '@frontend-tests/_helpers/authStateMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { describe, expect, it, vi } from 'vitest'

import SideBar from '@/views/navbar/SideBar.vue'

// Espace centre : l'alias `@surface` désigne le module du centre, sans entrée de console.
vi.mock('@surface', async () => await import('@/surface/centre'))

resetFrontendMocksBeforeEach()

describe('views/navbar/SideBar.vue (surface centre)', () => {
  it('gives a superadmin the link to their own company, and no clients list', () => {
    setAuthenticatedSuperadmin({ companyId: 7 })

    const wrapper = mountWithFrontendMocks(SideBar)
    const items = wrapper.findAll('[data-test="nav-item"]').map((item) => ({
      to: item.attributes('data-to'),
      labelKey: item.attributes('data-label-key'),
    }))

    expect(items).toEqual(
      expect.arrayContaining([{ to: '/clients/7', labelKey: 'navbar.myCompany' }])
    )
    expect(items).not.toEqual(
      expect.arrayContaining([{ to: '/clients', labelKey: 'navbar.clients' }])
    )
  })
})
