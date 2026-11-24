import { setAuthenticatedSuperadmin } from '@frontend-tests/_helpers/authStateMock'
import { mockLoadCompanyDetailsSuccess } from '@frontend-tests/_helpers/companiesServiceMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { currentRouteMock, pushMock } from '@frontend-tests/_helpers/routerMock'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import ClientDetailsView from '@/views/clients/ClientDetailsView.vue'

// Espace centre : pas de liste des clients, le retour d'un superadmin va à l'accueil.
vi.mock('@surface', async () => await import('@/surface/centre'))

resetFrontendMocksBeforeEach()

describe('views/clients/ClientDetailsView.vue (surface centre)', () => {
  it('goes back to the home page for a superadmin, the clients list being absent', async () => {
    setAuthenticatedSuperadmin()
    mockLoadCompanyDetailsSuccess()
    currentRouteMock.params = { id: '1' }

    const wrapper = mountWithFrontendMocks(ClientDetailsView, {
      global: {
        stubs: {
          clientDetailForm: true,
          clientDetailAccountsSection: true,
          clientDetailRoomsSection: true,
        },
      },
    })
    await nextTick()
    await nextTick()

    await wrapper.find('[data-test="base-card-actions"] [data-test="ui-button"]').trigger('click')

    expect(pushMock).toHaveBeenLastCalledWith('/')
  })
})
