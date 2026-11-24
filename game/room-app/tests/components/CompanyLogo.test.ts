import { mount } from '@vue/test-utils'

import RoomTopBar from '@/components/game/RoomTopBar.vue'
import { createAppI18n, setCurrentLocale } from '@/plugins/i18n'
import { enterDemo, setRoomCompany, signIn, syncRoomAuth } from '@/state/roomAuth'
import FinishedScreen from '@/views/game/FinishedScreen.vue'

const LOGO = 'http://localhost:3001/public/v1/logos/abc.png'
const COMPANY = { id: 1, name: 'Escape du Port', logoUrl: LOGO }

const SCREENS = [
  ['barre du haut', () => mount(RoomTopBar, { global: { plugins: [createAppI18n()] } })],
  [
    'podium',
    () =>
      mount(FinishedScreen, {
        props: { lines: [], aborted: false, noContent: false },
        global: { plugins: [createAppI18n()] },
      }),
  ],
] as const

describe.each(SCREENS)('logo du centre : %s', (_name, mountScreen) => {
  beforeEach(() => {
    localStorage.clear()
    setCurrentLocale('fr')
    syncRoomAuth()
    signIn('tok', { id: 10, companyId: 1, role: 'room' })
  })

  afterEach(() => syncRoomAuth())

  it('affiche le logo, nommé d’après le centre', () => {
    setRoomCompany(COMPANY)
    const img = mountScreen().find('[data-test="company-logo"]')

    expect(img.attributes('src')).toBe(LOGO)
    expect(img.attributes('alt')).toBe('Escape du Port')
  })

  it('n’ajoute rien sans logo', () => {
    setRoomCompany({ ...COMPANY, logoUrl: null })
    expect(mountScreen().find('[data-test="company-logo"]').exists()).toBe(false)

    setRoomCompany(null)
    expect(mountScreen().find('[data-test="company-logo"]').exists()).toBe(false)
  })

  it('retire l’image si elle ne charge pas', async () => {
    setRoomCompany(COMPANY)
    const wrapper = mountScreen()

    await wrapper.find('[data-test="company-logo"]').trigger('error')

    expect(wrapper.find('[data-test="company-logo"]').exists()).toBe(false)
  })

  it('retente avec un nouveau logo après une erreur', async () => {
    setRoomCompany(COMPANY)
    const wrapper = mountScreen()
    await wrapper.find('[data-test="company-logo"]').trigger('error')

    setRoomCompany({ ...COMPANY, logoUrl: `${LOGO}?v=2` })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-test="company-logo"]').exists()).toBe(true)
  })

  it('n’affiche rien en mode démo', () => {
    setRoomCompany(COMPANY)
    enterDemo()

    expect(mountScreen().find('[data-test="company-logo"]').exists()).toBe(false)
  })
})
