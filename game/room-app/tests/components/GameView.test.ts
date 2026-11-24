import { DEFAULT_GAME_TIMINGS, getMiniGameQuestion } from '@quizzup/game-engine'
import { type ButtonIndex, BUZZER_BUTTONS, type Desk } from '@quizzup/hardware'
import { MINI_GAME_FLASH_BLIND_TEST } from '@quizzup/shared'
import { flushPromises } from '@vue/test-utils'

import { getDemoThemes } from '@/game/demoContent'
import { createMemorySessionStorage } from '@/game/session'
import {
  closeGame,
  configureRoomGame,
  pressBuzzer,
  startNewGame,
  useRoomGame,
} from '@/game/useRoomGame'
import { saveRoomHardwareConfig, startLighting, useRoomHardware } from '@/hardware/roomHardware'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'
import GameView from '@/views/GameView.vue'

import { stubReducedMotion } from '../_helpers/animation'
import { createManualClock, REGISTRATIONS } from '../_helpers/fixtures'
import { pressKey } from '../_helpers/keyboard'
import { mountWithApp, PRELOAD_TIMEOUT_MS, preloadRoutes } from '../_helpers/mount'

beforeAll(preloadRoutes, PRELOAD_TIMEOUT_MS)

const BLIND_TEST_ONLY = [MINI_GAME_FLASH_BLIND_TEST]

const KEY_BY_DESK = { 1: 'Digit1', 2: 'KeyQ', 3: 'KeyA', 4: 'KeyZ' } as const

describe('GameView', () => {
  let clock: ReturnType<typeof createManualClock>

  /**
   * Appui de buzzer horodaté sur l'horloge simulée du moteur. Un appui clavier porterait le
   * `timeStamp` réel de l'événement : sur une machine chargée, il avancerait le moteur de plusieurs
   * secondes (paliers du blind test écoulés) pendant que le test attend.
   */
  function press(desk: Desk, buttonIndex: ButtonIndex): void {
    pressBuzzer({
      desk,
      button: BUZZER_BUTTONS[buttonIndex],
      buttonIndex,
      at: clock.value,
      code: 'test',
    })
  }

  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
    clock = createManualClock()
    configureRoomGame({ storage: createMemorySessionStorage(), now: clock.now })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    closeGame()
  })

  it('sans partie en mémoire (rechargement), renvoie au lancement pour reprendre d’un clic', async () => {
    const { router } = await mountWithApp(GameView, { route: '/play' })
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('launch'))
  })

  it('enveloppe l’écran de phase dans une transition, sans attendre la sortie (pas d’`out-in`)', async () => {
    startNewGame({
      registrations: REGISTRATIONS,
      themes: getDemoThemes(),
      seed: 11,
      miniGames: BLIND_TEST_ONLY,
    })
    const { wrapper } = await mountWithApp(GameView, { route: '/play' })

    const transition = wrapper.find('.game__stage > transition-stub')
    expect(transition.attributes('name')).toBe('phase')
    expect(transition.attributes('mode')).toBeUndefined()
    expect(transition.attributes('css')).toBe('true')
    expect(transition.find('.intro').exists()).toBe(true)
  })

  it('sans animation quand l’opérateur demande moins de mouvement : phase changée sans transition', async () => {
    stubReducedMotion(true)
    startNewGame({
      registrations: REGISTRATIONS,
      themes: getDemoThemes(),
      seed: 11,
      miniGames: BLIND_TEST_ONLY,
    })
    const { wrapper } = await mountWithApp(GameView, { route: '/play' })

    expect(wrapper.find('.game__stage > transition-stub').attributes('css')).toBe('false')
  })

  describe.each([
    { label: 'mouvement normal', reduced: false },
    { label: 'mouvement réduit', reduced: true },
  ])('vraie transition de phase, $label', ({ reduced }) => {
    it('affiche le choix du thème après l’annonce, sans laisser l’annonce à l’écran', async () => {
      stubReducedMotion(reduced)
      startNewGame({
        registrations: REGISTRATIONS,
        themes: getDemoThemes(),
        seed: 11,
        miniGames: BLIND_TEST_ONLY,
      })
      const { wrapper } = await mountWithApp(GameView, {
        route: '/play',
        stubs: { transition: false },
      })
      expect(wrapper.find('.game__stage > .intro').exists()).toBe(true)

      clock.advance(DEFAULT_GAME_TIMINGS.roundIntroMs + 1)

      await vi.waitFor(() => expect(wrapper.find('.game__stage > .choice').exists()).toBe(true))
      // La sortie est instantanée : jamais deux écrans en même temps dans la scène.
      expect(wrapper.find('.game__stage > .intro').exists()).toBe(false)
      expect(wrapper.find('.game__stage').element.children).toHaveLength(1)
    })
  })

  it('demande confirmation avant de quitter une partie en cours', async () => {
    startNewGame({
      registrations: REGISTRATIONS,
      themes: getDemoThemes(),
      seed: 11,
      miniGames: BLIND_TEST_ONLY,
    })
    // Les gardes de navigation d'un composant ne s'activent que rendu par <RouterView> (App).
    const { default: App } = await import('@/App.vue')
    const { router } = await mountWithApp(App, { route: '/play' })
    await flushPromises()
    const { useConfirm } = await import('@/composables/useConfirm')

    const refused = router.push('/lobby')
    await flushPromises()
    useConfirm().cancel()
    await refused
    expect(router.currentRoute.value.name).toBe('play')
    expect(useRoomGame().state.value?.phase.name).toBe('round_intro')

    const accepted = router.push('/lobby')
    await flushPromises()
    useConfirm().accept()
    await accepted
    expect(router.currentRoute.value.name).toBe('lobby')
    expect(useRoomGame().state.value).toBeNull()
  })

  it('enchaîne annonce, choix du thème, blind test et révélation au rythme du moteur', async () => {
    startNewGame({
      registrations: REGISTRATIONS,
      themes: getDemoThemes(),
      seed: 11,
      miniGames: BLIND_TEST_ONLY,
    })
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
    press(chooser, 0)
    await flushPromises()
    expect(wrapper.text()).toContain('Écoute…')
    expect(wrapper.find('.blind__stage--current').text()).toContain('100 pts')
    expect(wrapper.findAll('.answer')).toHaveLength(4)

    // 4. Un joueur buzze : il répond seul.
    press(1, 0)
    await flushPromises()
    expect(wrapper.text()).toContain('Léa répond !')

    // 5. Bonne réponse : révélation et points.
    const phase = state.value?.phase
    const answers =
      phase?.name === 'question' ? getMiniGameQuestion(phase.miniGameState).answers : []
    const correct = answers.findIndex((answer) => answer.isCorrect)
    press(1, Math.max(correct, 0) as ButtonIndex)
    await flushPromises()

    expect(wrapper.text()).toContain('Léa trouve au palier 1')
    expect(wrapper.find('.answer--correct').exists()).toBe(true)
    expect(state.value?.scores.find((line) => line.participantId === 1)?.score).toBe(100)
    wrapper.unmount()
  })

  it('le choisisseur lance la question avec une vraie touche du clavier', async () => {
    startNewGame({
      registrations: REGISTRATIONS,
      themes: getDemoThemes(),
      seed: 11,
      miniGames: BLIND_TEST_ONLY,
    })
    const { state } = useRoomGame()
    const { wrapper } = await mountWithApp(GameView, { route: '/play' })
    clock.advance(DEFAULT_GAME_TIMINGS.roundIntroMs + 1)
    await vi.waitFor(() => expect(state.value?.phase.name).toBe('theme_choice'))

    // Seule la phase est vérifiée : le `timeStamp` réel de l'événement ne doit rien changer au verdict.
    pressKey(KEY_BY_DESK[state.value?.rounds[0]?.chooserParticipantId as 1 | 2 | 3])
    await vi.waitFor(() => expect(state.value?.phase.name).toBe('question'))
    wrapper.unmount()
  })

  it('propose l’arrêt d’urgence des lumières quand la salle a des appareils', async () => {
    await saveRoomHardwareConfig({
      lighting: { fixtures: [{ id: 'par1', name: 'PAR 1', profileId: 'par-rgb', address: 1 }] },
    })
    await startLighting()
    startNewGame({ registrations: REGISTRATIONS, themes: getDemoThemes(), seed: 11 })
    const { wrapper } = await mountWithApp(GameView, { route: '/play' })

    await wrapper.find('[data-test="emergency-stop"]').trigger('click')
    await flushPromises()
    expect(useRoomHardware().lightingState.value?.emergency).toBe(true)

    await wrapper.find('[data-test="emergency-reset"]').trigger('click')
    // Le réarmement est confirmé (la modale n'est pas montée ici).
    const { useConfirm } = await import('@/composables/useConfirm')
    useConfirm().accept()
    await flushPromises()
    expect(useRoomHardware().lightingState.value?.emergency).toBe(false)
  })

  it('verrouille un joueur qui s’est trompé', async () => {
    startNewGame({
      registrations: REGISTRATIONS,
      themes: getDemoThemes(),
      seed: 11,
      miniGames: BLIND_TEST_ONLY,
    })
    const { state } = useRoomGame()
    const { wrapper } = await mountWithApp(GameView, { route: '/play' })
    clock.advance(DEFAULT_GAME_TIMINGS.roundIntroMs + 1)
    await vi.waitFor(() => expect(state.value?.phase.name).toBe('theme_choice'))
    press(state.value?.rounds[0]?.chooserParticipantId as 1 | 2 | 3, 0)
    await flushPromises()

    press(3, 0) // Inès buzze
    const phase = state.value?.phase
    const answers =
      phase?.name === 'question' ? getMiniGameQuestion(phase.miniGameState).answers : []
    const wrong = answers.findIndex((answer) => !answer.isCorrect)
    press(3, (wrong < 0 ? 1 : wrong) as ButtonIndex)
    await flushPromises()

    expect(wrapper.find('.score--locked').text()).toContain('Inès')
    expect(wrapper.text()).toContain('Bloqué')
    wrapper.unmount()
  })

  it('arrête la partie après confirmation et propose une nouvelle partie', async () => {
    startNewGame({
      registrations: REGISTRATIONS,
      themes: getDemoThemes(),
      seed: 11,
      miniGames: BLIND_TEST_ONLY,
    })
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
