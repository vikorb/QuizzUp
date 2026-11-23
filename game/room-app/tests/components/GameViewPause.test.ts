import { DEFAULT_GAME_TIMINGS } from '@quizzup/game-engine'
import { MINI_GAME_FLASH_BLIND_TEST } from '@quizzup/shared'
import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

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

import { createManualClock, REGISTRATIONS } from '../_helpers/fixtures'
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

  afterEach(() => {
    vi.useRealTimers()
    closeGame()
  })

  /** Amène la partie à la 1re question (le joueur désigné choisit le thème A). */
  async function reachQuestion() {
    const { state } = useRoomGame()

    clock.advance(DEFAULT_GAME_TIMINGS.roundIntroMs + 1)
    await vi.waitFor(() => expect(state.value?.phase.name).toBe('theme_choice'))
    const chooser = state.value?.rounds[0]?.chooserParticipantId as 1 | 2 | 3
    // Appui horodaté sur l'horloge simulée (le `timeStamp` d'un clavier simulé est réel).
    pressBuzzer({ desk: chooser, button: 'A', buttonIndex: 0, at: clock.value, code: 'test' })
    await flushPromises()
    expect(state.value?.phase.name).toBe('question')
  }

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

  describe('voile de pause', () => {
    it('est une boîte de dialogue modale nommée par son titre, focus sur « Reprendre »', async () => {
      const { wrapper } = await mountWithApp(GameView, { route: '/play' })

      await wrapper.find('[data-test="toggle-pause"]').trigger('click')
      const overlay = wrapper.find('[data-test="paused-overlay"]')

      expect(overlay.attributes('role')).toBe('alertdialog')
      expect(overlay.attributes('aria-modal')).toBe('true')
      const titleId = overlay.attributes('aria-labelledby')
      expect(titleId).toBeTruthy()
      expect(overlay.find(`#${titleId}`).text()).toBe('Pause')
      expect(document.activeElement).toBe(wrapper.find('[data-test="paused-resume"]').element)
    })

    it('est borné à la zone de jeu : la barre du haut n’est jamais sous le voile', async () => {
      const { wrapper } = await mountWithApp(GameView, { route: '/play' })

      await wrapper.find('[data-test="toggle-pause"]').trigger('click')
      const overlay = wrapper.find('[data-test="paused-overlay"]').element
      const topbar = wrapper.find('header').element

      expect(topbar.contains(overlay)).toBe(false)
      expect(overlay.closest('.game__body')).not.toBeNull()
      expect(overlay.closest('.game__body')?.contains(topbar)).toBe(false)
    })

    it('laisse l’arrêt d’urgence déclenchable pendant la pause, sans reprendre la partie', async () => {
      await saveRoomHardwareConfig({
        lighting: { fixtures: [{ id: 'par1', name: 'PAR 1', profileId: 'par-rgb', address: 1 }] },
      })
      await startLighting()
      const { wrapper } = await mountWithApp(GameView, { route: '/play' })
      const { paused } = useRoomGame()

      await wrapper.find('[data-test="toggle-pause"]').trigger('click')
      expect(wrapper.find('[data-test="paused-overlay"]').exists()).toBe(true)
      expect(useRoomHardware().lightingState.value?.emergency).toBe(false)

      await wrapper.find('[data-test="emergency-stop"]').trigger('click')
      await flushPromises()

      expect(useRoomHardware().lightingState.value?.emergency).toBe(true)
      expect(paused.value).toBe(true)
      expect(wrapper.find('[data-test="paused-overlay"]').exists()).toBe(true)

      // Réarmé pour ne pas laisser l'arrêt d'urgence actif aux autres tests.
      useRoomHardware().lighting.value?.resetEmergency()
    })

    it('laisse « Arrêter la partie » utilisable pendant la pause', async () => {
      const { wrapper } = await mountWithApp(GameView, { route: '/play' })
      const { state } = useRoomGame()
      const { useConfirm } = await import('@/composables/useConfirm')

      await wrapper.find('[data-test="toggle-pause"]').trigger('click')
      expect(wrapper.find('[data-test="paused-overlay"]').exists()).toBe(true)

      await wrapper.find('[data-test="abort-game"]').trigger('click')
      useConfirm().accept()
      await flushPromises()

      expect(state.value?.phase.name).toBe('aborted')
      expect(wrapper.find('[data-test="paused-overlay"]').exists()).toBe(false)
    })
  })

  describe('passer la question', () => {
    it('passe la question après confirmation, pas avant, et pas pendant une pause', async () => {
      const { wrapper } = await mountWithApp(GameView, { route: '/play' })
      const { state } = useRoomGame()
      const { useConfirm } = await import('@/composables/useConfirm')
      await reachQuestion()

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

    it('est désactivé hors question et pendant la pause, actif pendant une question', async () => {
      const { wrapper } = await mountWithApp(GameView, { route: '/play' })
      const skip = () => wrapper.find('[data-test="skip-question"]')

      // Annonce de la manche : pas de question à passer.
      expect(skip().attributes('disabled')).toBeDefined()

      await reachQuestion()
      await nextTick()
      expect(skip().attributes('disabled')).toBeUndefined()

      await wrapper.find('[data-test="toggle-pause"]').trigger('click')
      expect(skip().attributes('disabled')).toBeDefined()
      await wrapper.find('[data-test="toggle-pause"]').trigger('click')
      expect(skip().attributes('disabled')).toBeUndefined()
    })

    it('ne passe pas la question suivante si la visée a fini avant la validation, et le dit', async () => {
      const { wrapper } = await mountWithApp(GameView, { route: '/play' })
      const { state } = useRoomGame()
      const { useConfirm } = await import('@/composables/useConfirm')
      await reachQuestion()

      // Clic sur « Passer la question » : la confirmation attend l'opérateur…
      await wrapper.find('[data-test="skip-question"]').trigger('click')
      // … pendant ce temps la question visée et sa révélation passent, la suivante démarre.
      clock.advance(41_000)
      useRoomGame().session.value?.tick()
      expect(state.value?.phase).toMatchObject({ questionIndex: 1 })

      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      useConfirm().accept()
      await flushPromises()

      expect(state.value?.phase).toMatchObject({ name: 'question', questionIndex: 1 })
      expect(state.value?.rounds[0]?.skippedQuestionIds).toBeUndefined()
      const notice = wrapper.find('[data-test="command-refusal"]')
      expect(notice.attributes('role')).toBe('alert')
      expect(notice.text()).toBe('La question avait déjà changé : rien n’a été passé.')

      // Le message s'efface seul.
      vi.advanceTimersByTime(5000)
      await nextTick()
      expect(wrapper.find('[data-test="command-refusal"]').exists()).toBe(false)
    })
  })
})
