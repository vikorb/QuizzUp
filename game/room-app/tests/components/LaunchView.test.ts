import { flushPromises } from '@vue/test-utils'

import type { ExtractPlayer } from '@/audio/player'
import { getDemoThemes } from '@/game/demoContent'
import { createMemorySessionStorage, GameSession } from '@/game/session'
import { closeGame, configureRoomGame, useRoomGame } from '@/game/useRoomGame'
import { lockBuzzerSystemKeys } from '@/hardware/roomHardware'
import { enterDemo, syncRoomAuth } from '@/state/roomAuth'
import LaunchView from '@/views/LaunchView.vue'

import { REGISTRATIONS } from '../_helpers/fixtures'
import { mountWithApp } from '../_helpers/mount'

vi.mock('@/hardware/roomHardware', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  lockBuzzerSystemKeys: vi.fn(async () => true),
}))

async function launch() {
  const { wrapper, router } = await mountWithApp(LaunchView)
  const start = wrapper
    .findAll('button')
    .find((button) => button.text().includes('Lancer la salle'))
  await start?.trigger('click')
  await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('lobby'))
}

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

  it('ne pose le verrou clavier que si le plein écran est effectivement actif', async () => {
    const lock = vi.mocked(lockBuzzerSystemKeys)
    lock.mockClear()
    // Plein écran refusé : pas de verrou.
    document.documentElement.requestFullscreen = vi.fn(async () => undefined)
    await launch()
    expect(lock).not.toHaveBeenCalled()

    // Plein écran obtenu : verrou posé.
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
    document.documentElement.requestFullscreen = vi.fn(async () => {
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        value: document.documentElement,
      })
    })
    try {
      await launch()
      expect(lock).toHaveBeenCalledTimes(1)
    } finally {
      Reflect.deleteProperty(document, 'fullscreenElement')
    }
  })

  it('propose de reprendre une partie sauvegardée', async () => {
    const session = GameSession.create(
      {
        seed: 3,
        participants: [{ id: 1, podium: 1, displayName: 'Léa' }],
        themes: getDemoThemes(),
      },
      REGISTRATIONS.slice(0, 1),
      { storage }
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
      { storage }
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

  it('déconnecte la salle', async () => {
    const { wrapper, router } = await mountWithApp(LaunchView)

    await wrapper.find('[aria-label="Déconnecter la salle"]').trigger('click')

    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))
  })
})
