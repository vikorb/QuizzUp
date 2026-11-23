import { DEFAULT_GAME_TIMINGS } from '@quizzup/game-engine'
import { MINI_GAME_FLASH_BLIND_TEST } from '@quizzup/shared'
import { flushPromises } from '@vue/test-utils'

import { getDemoThemes } from '@/game/demoContent'
import { createMemorySessionStorage } from '@/game/session'
import { closeGame, configureRoomGame, startNewGame, useRoomGame } from '@/game/useRoomGame'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'
import GameView from '@/views/GameView.vue'

import { createManualClock, REGISTRATIONS } from '../_helpers/fixtures'
import { pressKey } from '../_helpers/keyboard'
import { mountWithApp, PRELOAD_TIMEOUT_MS, preloadRoutes } from '../_helpers/mount'

beforeAll(preloadRoutes, PRELOAD_TIMEOUT_MS)

describe('GameView : pause et passage de question', () => {
  let clock: ReturnType<typeof createManualClock>

  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
    clock = createManualClock()
    configureRoomGame({ storage: createMemorySessionStorage(), now: clock.now })
    startNewGame({
      registrations: REGISTRATIONS,
      themes: getDemoThemes(),
      seed: 11,
      miniGames: [MINI_GAME_FLASH_BLIND_TEST],
    })
  })

  afterEach(() => closeGame())

  it('affiche le voile Pause, fige la partie, et la reprise le retire', async () => {
    const { wrapper } = await mountWithApp(GameView, { route: '/play' })
    const { state } = useRoomGame()

    expect(wrapper.find('[data-test="paused-overlay"]').exists()).toBe(false)

    await wrapper.find('[data-test="toggle-pause"]').trigger('click')
    expect(wrapper.find('[data-test="paused-overlay"]').text()).toContain('Pause')
    expect(wrapper.find('[data-test="toggle-pause"]').attributes('aria-label')).toBe(
      'Reprendre la partie'
    )

    // Le temps passe, la manche ne bouge pas.
    clock.advance(DEFAULT_GAME_TIMINGS.roundIntroMs * 10)
    useRoomGame().session.value?.tick()
    expect(state.value?.phase.name).toBe('round_intro')

    await wrapper.find('[data-test="paused-resume"]').trigger('click')
    expect(wrapper.find('[data-test="paused-overlay"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="toggle-pause"]').attributes('aria-label')).toBe(
      'Mettre en pause'
    )
  })

  it('le bouton de la barre reprend aussi la partie', async () => {
    const { wrapper } = await mountWithApp(GameView, { route: '/play' })

    await wrapper.find('[data-test="toggle-pause"]').trigger('click')
    await wrapper.find('[data-test="toggle-pause"]').trigger('click')

    expect(wrapper.find('[data-test="paused-overlay"]').exists()).toBe(false)
  })

  it('passe la question après confirmation, pas avant, et pas pendant une pause', async () => {
    const { wrapper } = await mountWithApp(GameView, { route: '/play' })
    const { state } = useRoomGame()
    const { useConfirm } = await import('@/composables/useConfirm')

    clock.advance(DEFAULT_GAME_TIMINGS.roundIntroMs + 1)
    await vi.waitFor(() => expect(state.value?.phase.name).toBe('theme_choice'))
    const chooser = state.value?.rounds[0]?.chooserParticipantId as 1 | 2 | 3
    pressKey({ 1: 'Digit1', 2: 'KeyQ', 3: 'KeyA' }[chooser])
    await flushPromises()
    expect(state.value?.phase.name).toBe('question')

    // Annulé : la question continue.
    await wrapper.find('[data-test="skip-question"]').trigger('click')
    useConfirm().cancel()
    await flushPromises()
    expect(state.value?.phase.name).toBe('question')

    // Confirmé : question passée, sans point.
    await wrapper.find('[data-test="skip-question"]').trigger('click')
    useConfirm().accept()
    await flushPromises()
    expect(state.value?.phase.name).toBe('reveal')
    expect(state.value?.scores.every((line) => line.score === 0)).toBe(true)

    // En pause, la commande est désactivée.
    await wrapper.find('[data-test="toggle-pause"]').trigger('click')
    expect(wrapper.find('[data-test="skip-question"]').attributes('disabled')).toBeDefined()
  })
})
