import { flushPromises } from '@vue/test-utils'

import type { ExtractPlayer } from '@/audio/player'
import { rememberBackofficeGameId, reportFinishedGame } from '@/game/backofficeGame'
import { getDemoThemes } from '@/game/demoContent'
import { readPendingFinishes } from '@/game/pendingFinishes'
import { createMemorySessionStorage, GameSession } from '@/game/session'
import { closeGame, configureRoomGame, startNewGame, useRoomGame } from '@/game/useRoomGame'
import { lockBuzzerSystemKeys } from '@/hardware/roomHardware'
import { enterDemo, refreshRoomAccount, signIn, syncRoomAuth } from '@/state/roomAuth'
import * as roomApi from '@/utils/roomApi'
import LaunchView from '@/views/LaunchView.vue'

import { REGISTRATIONS } from '../_helpers/fixtures'
import { mountWithApp, PRELOAD_TIMEOUT_MS, preloadRoutes } from '../_helpers/mount'

beforeAll(preloadRoutes, PRELOAD_TIMEOUT_MS)

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

function signInAsRoom(): void {
  signIn('token-salle', { id: 10, companyId: 1, role: 'room' })
}

/** Jeton expiré en pleine partie : le PC est déconnecté, la sauvegarde est gardée. */
async function expireToken(): Promise<void> {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))
  await refreshRoomAccount()
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

    it('démo : ne propose pas la partie du backoffice mais la garde', async () => {
      saveGame(false)
      rememberBackofficeGameId(5, SEED)
      const { wrapper } = await mountWithApp(LaunchView)

      expect(wrapper.text()).not.toContain('Une partie est en cours')
      expect(storage.current).not.toBeNull()
    })

    it('démo : efface une sauvegarde sans partie retenue au backoffice', async () => {
      saveGame(false)
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

  describe('jeton expiré et changement de compte', () => {
    const SEED = 3
    const OTHER_ACCOUNT = { id: 11, companyId: 2, role: 'room' }

    function saveRoomGame(): GameSession {
      signIn('token-salle', { id: 10, companyId: 1, role: 'room' })
      const session = GameSession.create(
        {
          seed: SEED,
          participants: [{ id: 1, podium: 1, displayName: 'Léa' }],
          themes: getDemoThemes(),
        },
        REGISTRATIONS.slice(0, 1),
        { storage, demo: false }
      )
      session.start()
      rememberBackofficeGameId(5, SEED)
      return session
    }

    afterEach(() => {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    })

    it('reconnexion avec le même compte : la partie est reprise', async () => {
      saveRoomGame()
      await expireToken()
      signIn('nouveau-jeton', { id: 10, companyId: 1, role: 'room' })

      const { wrapper } = await mountWithApp(LaunchView)

      expect(wrapper.text()).toContain('Une partie est en cours')
    })

    it('mode démo après expiration : la partie de la salle est gardée puis reprise à la reconnexion', async () => {
      saveRoomGame()
      await expireToken()
      enterDemo()

      const demoScreen = await mountWithApp(LaunchView)
      expect(demoScreen.wrapper.text()).not.toContain('Une partie est en cours')
      expect(storage.current).not.toBeNull()
      demoScreen.wrapper.unmount()

      signIn('nouveau-jeton', { id: 10, companyId: 1, role: 'room' })
      const { wrapper } = await mountWithApp(LaunchView)
      expect(wrapper.text()).toContain('Une partie est en cours')
    })

    it('autre compte de salle : la partie n’est pas proposée mais gardée pour son compte', async () => {
      saveRoomGame()
      await expireToken()
      signIn('jeton-autre-salle', OTHER_ACCOUNT)

      const other = await mountWithApp(LaunchView)
      expect(other.wrapper.text()).not.toContain('Une partie est en cours')
      expect(storage.current).not.toBeNull()
      other.wrapper.unmount()

      signIn('jeton-salle', { id: 10, companyId: 1, role: 'room' })
      const { wrapper } = await mountWithApp(LaunchView)
      expect(wrapper.text()).toContain('Une partie est en cours')
    })

    it('autre compte de salle : la fin de partie n’est pas envoyée avec son jeton', async () => {
      const session = saveRoomGame()
      await expireToken()
      signIn('jeton-autre-salle', OTHER_ACCOUNT)
      const finish = vi.spyOn(roomApi, 'finishRoomGame')

      expect(reportFinishedGame(session.state)).toBeNull()
      expect(readPendingFinishes()).toEqual([])
      expect(finish).not.toHaveBeenCalled()
    })

    it('résultats envoyés : plus aucune reprise proposée', async () => {
      const session = saveRoomGame()
      vi.spyOn(roomApi, 'finishRoomGame').mockResolvedValue({ id: 5 } as never)

      expect(reportFinishedGame(session.state)).toBe(5)
      const { wrapper } = await mountWithApp(LaunchView)

      expect(wrapper.text()).not.toContain('Une partie est en cours')
      expect(storage.current).toBeNull()
    })
  })

  it('déconnecte la salle', async () => {
    const { wrapper, router } = await mountWithApp(LaunchView)

    await wrapper.find('[aria-label="Déconnecter la salle"]').trigger('click')

    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))
  })
})
