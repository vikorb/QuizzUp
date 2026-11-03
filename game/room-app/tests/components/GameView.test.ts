import { DEFAULT_GAME_TIMINGS } from '@quizzup/game-engine'
import { flushPromises } from '@vue/test-utils'

import { getDemoThemes } from '@/game/demoContent'
import { createMemorySessionStorage } from '@/game/session'
import { closeGame, configureRoomGame, startNewGame, useRoomGame } from '@/game/useRoomGame'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'
import GameView from '@/views/GameView.vue'

import { createManualClock, REGISTRATIONS } from '../_helpers/fixtures'
import { mountWithApp } from '../_helpers/mount'

const KEY_BY_DESK = { 1: 'Digit1', 2: 'KeyQ', 3: 'KeyA', 4: 'KeyZ' } as const

function press(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code }))
}

describe('GameView', () => {
  let clock: ReturnType<typeof createManualClock>

  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
    clock = createManualClock()
    configureRoomGame({ storage: createMemorySessionStorage(), now: clock.now })
  })

  afterEach(() => closeGame())

  it('sans partie en cours, renvoie au lobby', async () => {
    const { wrapper, router } = await mountWithApp(GameView, { route: '/play' })
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('lobby'))
    wrapper.unmount()
  })

  it('enchaîne annonce, choix du thème, blind test et révélation au rythme du moteur', async () => {
    startNewGame({ registrations: REGISTRATIONS, themes: getDemoThemes(), seed: 11 })
    const { state } = useRoomGame()
    const { wrapper } = await mountWithApp(GameView, { route: '/play' })

    // 1. Annonce du mini-jeu tiré au sort.
    expect(wrapper.text()).toContain('Blind test éclair')
    expect(wrapper.text()).toContain('Manche 1 / 10')
    expect(wrapper.findAll('.score')).toHaveLength(3)

    // 2. Choix du thème par le joueur désigné.
    clock.advance(DEFAULT_GAME_TIMINGS.roundIntroMs + 1)
    await vi.waitFor(() => expect(wrapper.text()).toContain('choisit le thème'))
    expect(wrapper.findAll('.choice__theme')).toHaveLength(4)
    const chooser = state.value?.rounds[0]?.chooserParticipantId as 1 | 2 | 3
    expect(wrapper.find('.score--active').text()).toContain(
      REGISTRATIONS.find((registration) => registration.desk === chooser)?.displayName
    )

    // 3. Le choisisseur appuie sur A : la question démarre, l'extrait du palier 1 « joue ».
    press(KEY_BY_DESK[chooser])
    await flushPromises()
    expect(wrapper.text()).toContain('Écoute…')
    expect(wrapper.find('.blind__stage--current').text()).toContain('100 pts')
    expect(wrapper.findAll('.answer')).toHaveLength(4)

    // 4. Un joueur buzze : il répond seul.
    press('Digit1')
    await flushPromises()
    expect(wrapper.text()).toContain('Léa répond !')

    // 5. Bonne réponse : révélation et points.
    const phase = state.value?.phase
    const answers = phase?.name === 'question' ? phase.miniGameState.question.answers : []
    const correct = answers.findIndex((answer) => answer.isCorrect)
    press(['Digit1', 'Digit2', 'Digit3', 'Digit4'][correct] ?? 'Digit1')
    await flushPromises()

    expect(wrapper.text()).toContain('Léa trouve au palier 1')
    expect(wrapper.find('.answer--correct').exists()).toBe(true)
    expect(state.value?.scores.find((line) => line.participantId === 1)?.score).toBe(100)
    wrapper.unmount()
  })

  it('verrouille un joueur qui s’est trompé', async () => {
    startNewGame({ registrations: REGISTRATIONS, themes: getDemoThemes(), seed: 11 })
    const { state } = useRoomGame()
    const { wrapper } = await mountWithApp(GameView, { route: '/play' })
    clock.advance(DEFAULT_GAME_TIMINGS.roundIntroMs + 1)
    await vi.waitFor(() => expect(state.value?.phase.name).toBe('theme_choice'))
    press(KEY_BY_DESK[state.value?.rounds[0]?.chooserParticipantId as 1 | 2 | 3])
    await flushPromises()

    press('KeyA') // Inès buzze
    const phase = state.value?.phase
    const answers = phase?.name === 'question' ? phase.miniGameState.question.answers : []
    const wrong = answers.findIndex((answer) => !answer.isCorrect)
    press(['KeyA', 'KeyS', 'KeyD', 'KeyF'][wrong] ?? 'KeyS')
    await flushPromises()

    expect(wrapper.find('.score--locked').text()).toContain('Inès')
    expect(wrapper.text()).toContain('Bloqué')
    wrapper.unmount()
  })

  it('arrête la partie après confirmation et propose une nouvelle partie', async () => {
    startNewGame({ registrations: REGISTRATIONS, themes: getDemoThemes(), seed: 11 })
    const { wrapper, router } = await mountWithApp(GameView, { route: '/play' })

    await wrapper.find('[aria-label="Arrêter la partie"]').trigger('click')
    // La modale de confirmation n'est pas montée ici : on résout la confirmation directement.
    const { useConfirm } = await import('@/composables/useConfirm')
    useConfirm().accept()
    await flushPromises()

    expect(wrapper.text()).toContain('Partie arrêtée')
    const again = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Nouvelle partie'))
    await again?.trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('lobby'))
    expect(useRoomGame().state.value).toBeNull()
    wrapper.unmount()
  })
})
