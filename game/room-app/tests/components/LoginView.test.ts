import { flushPromises } from '@vue/test-utils'

import { syncRoomAuth } from '@/state/roomAuth'
import LoginView from '@/views/LoginView.vue'

import { mountWithApp, PRELOAD_TIMEOUT_MS, preloadRoutes } from '../_helpers/mount'

beforeAll(preloadRoutes, PRELOAD_TIMEOUT_MS)

describe('LoginView', () => {
  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
  })

  afterEach(() => vi.unstubAllGlobals())

  it('exige identifiant et mot de passe', async () => {
    const { wrapper } = await mountWithApp(LoginView, { route: '/login' })

    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('Champ requis.')
    wrapper.unmount()
  })

  it('affiche l’erreur « pas un compte de salle »', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'jwt' }), { status: 200 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ admin: { id: 1, companyId: 1, role: 'user' } }), {
            status: 200,
          })
        )
        .mockResolvedValue(new Response('{}', { status: 200 }))
    )
    const { wrapper, router } = await mountWithApp(LoginView, { route: '/login' })

    await wrapper.find('input[name=identifier]').setValue('staff')
    await wrapper.find('input[name=password]').setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('n’est pas un compte de salle')
    expect(router.currentRoute.value.name).toBe('login')
    wrapper.unmount()
  })

  it('connecte la salle et ouvre l’écran de lancement', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'jwt' }), { status: 200 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ admin: { id: 5, companyId: 1, role: 'room' } }), {
            status: 200,
          })
        )
    )
    const { wrapper, router } = await mountWithApp(LoginView, { route: '/login' })

    await wrapper.find('input[name=identifier]').setValue('salle-1')
    await wrapper.find('input[name=password]').setValue('secret')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('launch'))
    expect(localStorage.getItem('quizzup_room_token')).toBe('jwt')
    wrapper.unmount()
  })

  it('ouvre le mode démo sans compte', async () => {
    const { wrapper, router } = await mountWithApp(LoginView, { route: '/login' })

    const demo = wrapper.findAll('button').find((button) => button.text().includes('mode démo'))
    await demo?.trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('launch'))
    wrapper.unmount()
  })
})
