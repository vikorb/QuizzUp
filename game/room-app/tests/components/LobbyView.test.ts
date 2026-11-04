import { flushPromises } from '@vue/test-utils'

import { createMemorySessionStorage } from '@/game/session'
import { closeGame, configureRoomGame, useRoomGame } from '@/game/useRoomGame'
import { saveRoomDesksCount } from '@/hardware/roomHardware'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'
import LobbyView from '@/views/LobbyView.vue'

import { pressKey } from '../_helpers/keyboard'
import { mountWithApp } from '../_helpers/mount'

function findButton(wrapper: Awaited<ReturnType<typeof mountWithApp>>['wrapper'], label: string) {
  return wrapper.findAll('button').find((button) => button.text().includes(label))
}

describe('LobbyView', () => {
  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
    configureRoomGame({ storage: createMemorySessionStorage() })
  })

  afterEach(() => closeGame())

  it('demande au moins un joueur', async () => {
    const { wrapper, router } = await mountWithApp(LobbyView, { route: '/lobby' })

    await findButton(wrapper, 'Démarrer la partie')?.trigger('click')

    expect(wrapper.text()).toContain('Inscris au moins un joueur')
    expect(router.currentRoute.value.name).toBe('lobby')
    wrapper.unmount()
  })

  it('bloque un email sans consentement, puis démarre une fois la case cochée', async () => {
    const { wrapper, router } = await mountWithApp(LobbyView, { route: '/lobby' })

    await wrapper.find('input[name=desk-2-name]').setValue('Hugo')
    await wrapper.find('input[name=desk-2-email]').setValue('hugo@exemple.fr')
    await findButton(wrapper, 'Démarrer la partie')?.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Coche la case de consentement')
    expect(router.currentRoute.value.name).toBe('lobby')

    await wrapper.find('.consent__box').setValue(true)
    await findButton(wrapper, 'Démarrer la partie')?.trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('play'))
    const { state, session } = useRoomGame()
    expect(state.value?.setup.participants).toEqual([{ id: 2, podium: 2, displayName: 'Hugo' }])
    // Mode démo : partie courte par défaut.
    expect(state.value?.setup.roundsCount).toBe(3)
    expect(session.value?.savedRegistrations[0]).toMatchObject({
      email: 'hugo@exemple.fr',
      consent: true,
    })
    wrapper.unmount()
  })

  it('changer l’email retire le consentement donné', async () => {
    const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })

    await wrapper.find('input[name=desk-1-email]').setValue('lea@exemple.fr')
    await wrapper.find('.consent__box').setValue(true)
    expect((wrapper.find('.consent__box').element as HTMLInputElement).checked).toBe(true)

    await wrapper.find('input[name=desk-1-email]').setValue('lea2@exemple.fr')
    expect((wrapper.find('.consent__box').element as HTMLInputElement).checked).toBe(false)
    wrapper.unmount()
  })

  it('fait briller le pupitre dont un buzzer est pressé', async () => {
    const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })

    pressKey('KeyZ')
    await flushPromises()

    expect(wrapper.find('.desk--4').classes()).toContain('desk--ping')
    expect(wrapper.find('.desk--4').text()).toContain('Buzzer OK')
    wrapper.unmount()
  })
})

describe('LobbyView — nombre de pupitres de la salle', () => {
  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
    configureRoomGame({ storage: createMemorySessionStorage() })
  })

  afterEach(() => closeGame())

  it('affiche 4 pupitres par défaut', async () => {
    const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })

    expect(wrapper.findAll('article.desk')).toHaveLength(4)
    expect(wrapper.find('.desk--5').exists()).toBe(false)
    wrapper.unmount()
  })

  it.each([
    [1, 1],
    [2, 2],
    [5, 3],
    [6, 3],
  ])('affiche %i pupitre(s) sur %i colonne(s)', async (count, columns) => {
    await saveRoomDesksCount(count)
    const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })

    expect(wrapper.findAll('article.desk')).toHaveLength(count)
    expect(wrapper.find('[data-test="lobby-desks"]').attributes('style')).toContain(
      `--desk-cols: ${columns}`
    )
    wrapper.unmount()
  })

  it('annonce le nombre de pupitres dans le sous-titre', async () => {
    const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })
    expect(wrapper.text()).toContain('de 1 à 4')

    await saveRoomDesksCount(6)
    await flushPromises()
    expect(wrapper.text()).toContain('de 1 à 6')
    wrapper.unmount()
  })

  it('refait la liste des pupitres si la config arrive après, sans perdre les saisies', async () => {
    const { wrapper } = await mountWithApp(LobbyView, { route: '/lobby' })
    await wrapper.find('input[name=desk-2-name]').setValue('Hugo')
    expect(wrapper.findAll('article.desk')).toHaveLength(4)

    await saveRoomDesksCount(6)
    await flushPromises()
    expect(wrapper.findAll('article.desk')).toHaveLength(6)
    expect(wrapper.find<HTMLInputElement>('input[name=desk-2-name]').element.value).toBe('Hugo')
    await wrapper.find('input[name=desk-6-name]').setValue('Zoé')

    await saveRoomDesksCount(3)
    await flushPromises()
    expect(wrapper.findAll('article.desk')).toHaveLength(3)
    expect(wrapper.find<HTMLInputElement>('input[name=desk-2-name]').element.value).toBe('Hugo')
    expect(wrapper.find('input[name=desk-6-name]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('démarre une partie à 6 joueurs et fait briller les pupitres 5 et 6', async () => {
    await saveRoomDesksCount(6)
    const { wrapper, router } = await mountWithApp(LobbyView, { route: '/lobby' })

    for (let desk = 1; desk <= 6; desk += 1) {
      await wrapper.find(`input[name=desk-${desk}-name]`).setValue(`Joueur ${desk}`)
    }
    pressKey('Digit6')
    pressKey('KeyT')
    await flushPromises()
    expect(wrapper.find('.desk--5').classes()).toContain('desk--ping')
    expect(wrapper.find('.desk--6').classes()).toContain('desk--ping')

    await findButton(wrapper, 'Démarrer la partie')?.trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('play'))
    const { state } = useRoomGame()
    expect(state.value?.setup.participants.map((participant) => participant.podium)).toEqual([
      1, 2, 3, 4, 5, 6,
    ])
    wrapper.unmount()
  })
})

describe('LobbyView — échec au démarrage', () => {
  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
    configureRoomGame({ storage: createMemorySessionStorage() })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    closeGame()
  })

  it('affiche un message si le contenu ne peut pas être chargé', async () => {
    const content = await import('@/game/content')
    vi.spyOn(content, 'loadDemoThemes').mockRejectedValueOnce(new Error('api down'))
    const { wrapper, router } = await mountWithApp(LobbyView, { route: '/lobby' })

    await wrapper.find('input[name=desk-1-name]').setValue('Léa')
    await findButton(wrapper, 'Démarrer la partie')?.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Impossible de démarrer la partie')
    expect(router.currentRoute.value.name).toBe('lobby')
  })
})
