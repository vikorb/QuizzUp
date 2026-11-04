import { flushPromises } from '@vue/test-utils'

import type { ExtractPlayer } from '@/audio/player'
import { rememberBackofficeGameId } from '@/game/backofficeGame'
import { getDemoThemes } from '@/game/demoContent'
import { createMemorySessionStorage, GameSession } from '@/game/session'
import { closeGame, configureRoomGame, startNewGame, useRoomGame } from '@/game/useRoomGame'
import { enterDemo, signIn, syncRoomAuth } from '@/state/roomAuth'
import LaunchView from '@/views/LaunchView.vue'

import { REGISTRATIONS } from '../_helpers/fixtures'
import { mountWithApp } from '../_helpers/mount'

function fakePlayer(): ExtractPlayer {
  return {
    unlock: vi.fn(async () => undefined),
    preload: vi.fn(async () => ({ loaded: [], failed: [] })),
    play: vi.fn(async () => 'ended' as const),
    pause: vi.fn(() => 0),
    resume: vi.fn(),
    stop: vi.fn(),
    isLoaded: vi.fn(() => true),
    release: vi.fn(),
  }
}

function signInAsRoom(): void {
  signIn('token-salle', { id: 10, companyId: 1, role: 'room' })
}

describe('LaunchView', () => {
  let storage: ReturnType<typeof createMemorySessionStorage>
  let player: ExtractPlayer

  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
    enterDemo()
    storage = createMemorySessionStorage()
    player = fakePlayer()
    configureRoomGame({ storage, player })
  })

  afterEach(() => closeGame())

  it('« Lancer la salle » débloque le son, tente le plein écran puis ouvre le lobby', async () => {
    const requestFullscreen = vi.fn(async () => undefined)
    document.documentElement.requestFullscreen = requestFullscreen
    const { wrapper, router } = await mountWithApp(LaunchView)

    const start = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Lancer la salle'))
    await start?.trigger('click')

    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('lobby'))
    expect(player.unlock).toHaveBeenCalled()
    expect(requestFullscreen).toHaveBeenCalled()
  })

  it('propose de reprendre une partie sauvegardée', async () => {
    const session = GameSession.create(
      {
        seed: 3,
        participants: [{ id: 1, podium: 1, displayName: 'Léa' }],
        themes: getDemoThemes(),
      },
      REGISTRATIONS.slice(0, 1),
      { storage, demo: true }
    )
    session.start()
    const { wrapper, router } = await mountWithApp(LaunchView)

    expect(wrapper.text()).toContain('Une partie est en cours')
    const resume = wrapper.findAll('button').find((button) => button.text().includes('Reprendre'))
    await resume?.trigger('click')

    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('play'))
    expect(useRoomGame().state.value?.phase.name).toBe('round_intro')
  })

  it('abandonne la partie sauvegardée après confirmation', async () => {
    GameSession.create(
      {
        seed: 3,
        participants: [{ id: 1, podium: 1, displayName: 'Léa' }],
        themes: getDemoThemes(),
      },
      [],
      { storage, demo: true }
    )
    const { wrapper } = await mountWithApp(LaunchView)

    const discard = wrapper.findAll('button').find((button) => button.text().includes('Abandonner'))
    await discard?.trigger('click')
    const { useConfirm } = await import('@/composables/useConfirm')
    useConfirm().accept()
    await flushPromises()

    expect(storage.current).toBeNull()
    expect(wrapper.text()).not.toContain('Une partie est en cours')
  })

  describe('sauvegarde d’un autre contexte', () => {
    const SEED = 3

    function saveGame(demo: boolean): void {
      GameSession.create(
        {
          seed: SEED,
          participants: [{ id: 1, podium: 1, displayName: 'Léa' }],
          themes: getDemoThemes(),
        },
        REGISTRATIONS.slice(0, 1),
        { storage, demo }
      ).start()
    }

    it('démo : ne propose pas et efface la sauvegarde d’une partie du backoffice', async () => {
      saveGame(false)
      rememberBackofficeGameId(5, SEED)
      const { wrapper } = await mountWithApp(LaunchView)

      expect(wrapper.text()).not.toContain('Une partie est en cours')
      expect(storage.current).toBeNull()
    })

    it('compte de salle : propose la partie retenue du backoffice', async () => {
      signInAsRoom()
      saveGame(false)
      rememberBackofficeGameId(5, SEED)
      const { wrapper } = await mountWithApp(LaunchView)

      expect(wrapper.text()).toContain('Une partie est en cours')
      expect(storage.current).not.toBeNull()
    })

    it('compte de salle : ignore et efface une partie démo', async () => {
      signInAsRoom()
      saveGame(true)
      rememberBackofficeGameId(5, SEED)
      const { wrapper } = await mountWithApp(LaunchView)

      expect(wrapper.text()).not.toContain('Une partie est en cours')
      expect(storage.current).toBeNull()
    })

    it('compte de salle : ignore et efface une partie d’une autre graine', async () => {
      signInAsRoom()
      saveGame(false)
      rememberBackofficeGameId(5, SEED + 1)
      const { wrapper } = await mountWithApp(LaunchView)

      expect(wrapper.text()).not.toContain('Une partie est en cours')
      expect(storage.current).toBeNull()
    })

    it('ne touche pas à la sauvegarde d’une partie en cours de jeu', async () => {
      signInAsRoom()
      startNewGame({
        registrations: REGISTRATIONS.slice(0, 1),
        themes: getDemoThemes(),
        seed: SEED,
      })
      const { wrapper } = await mountWithApp(LaunchView)

      expect(wrapper.text()).not.toContain('Une partie est en cours')
      expect(storage.current).not.toBeNull()
    })
  })

  it('déconnecte la salle', async () => {
    const { wrapper, router } = await mountWithApp(LaunchView)

    await wrapper.find('[aria-label="Déconnecter la salle"]').trigger('click')

    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))
  })
})
