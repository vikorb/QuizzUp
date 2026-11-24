import {
  acceptGameRegistrationServiceMock,
  closeGameJoinServiceMock,
  createGameFixture,
  createJoinFixture,
  createParticipantFixture,
  createRegistrationFixture,
  JOIN_QR_SVG,
  listGameRegistrationsServiceMock,
  listGameRoomsServiceMock,
  mockServiceFailure,
  openGameJoinServiceMock,
  refuseGameRegistrationServiceMock,
  resetGamesServiceMock,
} from '@frontend-tests/_helpers/gamesServiceMock'
import { mountWithFrontendMocks, tWithParamsMock } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { GAME_STATE_PENDING, GAME_STATE_RUNNING } from '@quizzup/shared'
import { enableAutoUnmount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Game, GameRegistration } from '@/types/game'
import GameJoinPanel from '@/views/games/detail/GameJoinPanel.vue'

vi.mock('@/services/gamesService', async () => {
  const gamesService = await import('@frontend-tests/_helpers/gamesServiceMock')

  return gamesService.gamesServiceModuleMock
})

resetFrontendMocksBeforeEach()

// Les minuteries d'interrogation sont retirées au démontage : une vue oubliée ferait des appels en trop.
enableAutoUnmount(afterEach)

const GAME_ID = 4
const COMPANY_ID = 1
const POLL_MS = 5000

beforeEach(() => {
  resetGamesServiceMock()
  // Seuls l'intervalle et l'horloge sont simulés : `flushPromises` garde ses minuteries réelles.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(new Date('2026-11-24T10:00:00.000Z'))
  setVisibility('visible')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
}

function createGame(overrides: Partial<Game> = {}): Game {
  return createGameFixture({
    id: GAME_ID,
    companyId: COMPANY_ID,
    roomId: 10,
    state: GAME_STATE_PENDING,
    join: createJoinFixture(),
    pendingRegistrationsCount: 0,
    ...overrides,
  })
}

function setRegistrations(registrations: GameRegistration[]): void {
  listGameRegistrationsServiceMock.mockResolvedValue({
    ok: true,
    status: 200,
    data: { registrations },
  })
}

const fusees = createRegistrationFixture({ id: 5, displayName: 'Les Fusées' })
const comètes = createRegistrationFixture({
  id: 6,
  displayName: 'Les Comètes',
  email: 'chef@example.test',
  hasEmail: true,
  marketingConsent: true,
  secondPlayer: { displayName: 'Sam', email: null, hasEmail: false, marketingConsent: false },
})

async function mountPanel(game: Game = createGame()): Promise<VueWrapper> {
  const wrapper = mountWithFrontendMocks(GameJoinPanel, {
    props: { game },
    global: { mocks: { $t: tWithParamsMock } },
  })

  await flushPromises()

  return wrapper
}

const find = (wrapper: VueWrapper, name: string) => wrapper.find(`[data-test="${name}"]`)
const row = (wrapper: VueWrapper, id: number) => find(wrapper, `game-join-registration-${id}`)
const rowButton = (wrapper: VueWrapper, id: number, name: string) =>
  wrapper.get(`[data-test="game-join-registration-${id}"] [data-test="${name}"]`)

async function tick(wrapper: VueWrapper, ms = POLL_MS): Promise<void> {
  void wrapper
  vi.advanceTimersByTime(ms)
  await flushPromises()
}

describe('views/games/detail/GameJoinPanel.vue: states', () => {
  it('says it is loading until the first answer', async () => {
    let answer!: (value: Awaited<ReturnType<typeof listGameRegistrationsServiceMock>>) => void
    listGameRegistrationsServiceMock.mockReturnValue(new Promise((resolve) => (answer = resolve)))

    const wrapper = await mountPanel()

    expect(find(wrapper, 'game-join-loading').exists()).toBe(true)
    expect(find(wrapper, 'game-join-empty').exists()).toBe(false)

    answer({ ok: true, status: 200, data: { registrations: [] } })
    await flushPromises()

    expect(find(wrapper, 'game-join-loading').exists()).toBe(false)
    expect(find(wrapper, 'game-join-empty').text()).toBe('gameJoin.empty')
  })

  it('shows an empty state with a count of zero when nobody asked yet', async () => {
    const wrapper = await mountPanel()

    expect(listGameRegistrationsServiceMock).toHaveBeenCalledWith(COMPANY_ID, GAME_ID)
    expect(find(wrapper, 'game-join-count').text()).toBe('gameJoin.count:{"count":0}')
    expect(find(wrapper, 'game-join-empty').exists()).toBe(true)
    expect(wrapper.findAll('li')).toHaveLength(0)
  })

  it('lists the requests, oldest first as the API sends them, with their details', async () => {
    setRegistrations([fusees, comètes])

    const wrapper = await mountPanel()

    expect(find(wrapper, 'game-join-count').text()).toBe('gameJoin.count:{"count":2}')
    expect(find(wrapper, 'game-join-empty').exists()).toBe(false)
    expect(wrapper.findAll('li').map((item) => item.attributes('data-test'))).toEqual([
      'game-join-registration-5',
      'game-join-registration-6',
    ])
    expect(row(wrapper, 5).text()).toContain('Les Fusées')
    expect(row(wrapper, 6).text()).toContain('Les Comètes')
    expect(row(wrapper, 6).text()).toContain('gameJoin.secondPlayer:{"name":"Sam"}')
    expect(row(wrapper, 6).text()).toContain('gameJoin.email:{"email":"chef@example.test"}')
    expect(row(wrapper, 6).text()).toContain('gameJoin.marketing')
    expect(row(wrapper, 5).text()).not.toContain('gameJoin.email')
    expect(row(wrapper, 5).text()).not.toContain('gameJoin.marketing')
  })

  it('says an email was given without showing it when the role cannot read it', async () => {
    setRegistrations([createRegistrationFixture({ id: 7, hasEmail: true, email: null })])

    const wrapper = await mountPanel()

    expect(row(wrapper, 7).text()).toContain('gameJoin.emailMasked')
  })

  it('shows the translated error of the API, never its raw code, and recovers on retry', async () => {
    mockServiceFailure(listGameRegistrationsServiceMock, 'forbidden', 403)

    const wrapper = await mountPanel()

    expect(find(wrapper, 'game-join-load-error').text()).toContain('games.errors.forbidden')
    expect(find(wrapper, 'game-join-load-error').text()).not.toContain('"forbidden"')
    expect(find(wrapper, 'game-join-empty').exists()).toBe(false)

    setRegistrations([fusees])
    await find(wrapper, 'game-join-retry').trigger('click')
    await flushPromises()

    expect(find(wrapper, 'game-join-load-error').exists()).toBe(false)
    expect(row(wrapper, 5).exists()).toBe(true)
  })

  it('keeps the list on screen when a later poll fails', async () => {
    setRegistrations([fusees])

    const wrapper = await mountPanel()

    mockServiceFailure(listGameRegistrationsServiceMock, 'api_unreachable', null)
    await tick(wrapper)

    expect(find(wrapper, 'game-join-load-error').text()).toContain('games.errors.apiUnreachable')
    expect(row(wrapper, 5).exists()).toBe(true)
  })

  it('shows nothing and asks nothing for a game that is not pending any more', async () => {
    const wrapper = await mountPanel(createGame({ state: GAME_STATE_RUNNING }))

    expect(find(wrapper, 'game-join-panel').exists()).toBe(false)
    expect(wrapper.find('[data-test="base-card"]').exists()).toBe(false)
    expect(listGameRegistrationsServiceMock).not.toHaveBeenCalled()
    expect(listGameRoomsServiceMock).not.toHaveBeenCalled()

    await tick(wrapper, POLL_MS * 3)

    expect(listGameRegistrationsServiceMock).not.toHaveBeenCalled()
  })
})

describe('views/games/detail/GameJoinPanel.vue: polling', () => {
  it('reads the requests every 5 seconds while the game is pending', async () => {
    const wrapper = await mountPanel()

    expect(listGameRegistrationsServiceMock).toHaveBeenCalledTimes(1)

    await tick(wrapper, POLL_MS - 1)
    expect(listGameRegistrationsServiceMock).toHaveBeenCalledTimes(1)

    await tick(wrapper, 1)
    expect(listGameRegistrationsServiceMock).toHaveBeenCalledTimes(2)

    await tick(wrapper)
    expect(listGameRegistrationsServiceMock).toHaveBeenCalledTimes(3)
  })

  it('shows a request that arrives between two polls', async () => {
    const wrapper = await mountPanel()

    setRegistrations([fusees])
    await tick(wrapper)

    expect(row(wrapper, 5).exists()).toBe(true)
    expect(find(wrapper, 'game-join-count').text()).toBe('gameJoin.count:{"count":1}')
  })

  it('stops when the component is destroyed', async () => {
    const wrapper = await mountPanel()

    wrapper.unmount()
    await tick(wrapper, POLL_MS * 4)

    expect(listGameRegistrationsServiceMock).toHaveBeenCalledTimes(1)
  })

  it('stops, and hides the panel, once the game is launched', async () => {
    const wrapper = await mountPanel()

    await wrapper.setProps({ game: createGame({ state: GAME_STATE_RUNNING }) })
    await tick(wrapper, POLL_MS * 4)

    expect(listGameRegistrationsServiceMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-test="base-card"]').exists()).toBe(false)
  })

  it('skips the poll while the tab is hidden and reads again as soon as it is back', async () => {
    const wrapper = await mountPanel()

    setVisibility('hidden')
    await tick(wrapper, POLL_MS * 3)
    expect(listGameRegistrationsServiceMock).toHaveBeenCalledTimes(1)

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()

    expect(listGameRegistrationsServiceMock).toHaveBeenCalledTimes(2)
  })

  it('does not stack requests when the server is slow', async () => {
    listGameRegistrationsServiceMock.mockReturnValue(new Promise(() => {}))

    const wrapper = await mountPanel()

    await tick(wrapper, POLL_MS * 3)

    expect(listGameRegistrationsServiceMock).toHaveBeenCalledTimes(1)
  })
})

describe('views/games/detail/GameJoinPanel.vue: validate and refuse', () => {
  it('validates a request on the podium chosen, then drops it and asks the page to reload', async () => {
    setRegistrations([fusees, comètes])

    const wrapper = await mountPanel()

    await row(wrapper, 5).get('select').setValue('2')
    await rowButton(wrapper, 5, 'game-join-accept').trigger('click')
    await flushPromises()

    expect(acceptGameRegistrationServiceMock).toHaveBeenCalledWith(COMPANY_ID, GAME_ID, 5, 2)
    expect(row(wrapper, 5).exists()).toBe(false)
    expect(row(wrapper, 6).exists()).toBe(true)
    expect(find(wrapper, 'game-join-count').text()).toBe('gameJoin.count:{"count":1}')
    expect(wrapper.emitted('changed')).toHaveLength(1)
  })

  it('lets the server pick the first free podium when none is chosen', async () => {
    setRegistrations([fusees])

    const wrapper = await mountPanel()

    await rowButton(wrapper, 5, 'game-join-accept').trigger('click')
    await flushPromises()

    expect(acceptGameRegistrationServiceMock).toHaveBeenCalledWith(
      COMPANY_ID,
      GAME_ID,
      5,
      undefined
    )
  })

  it('offers the podiums of the room of the game', async () => {
    setRegistrations([fusees])

    const wrapper = await mountPanel(createGame({ roomId: 11 }))

    // « Premier libre » plus les 6 pupitres de la salle 11.
    expect(row(wrapper, 5).findAll('option')).toHaveLength(7)

    const small = await mountPanel(createGame({ roomId: 10 }))

    expect(row(small, 5).findAll('option')).toHaveLength(5)
  })

  it('keeps the default podiums when the rooms cannot be read', async () => {
    mockServiceFailure(listGameRoomsServiceMock)
    setRegistrations([fusees])

    const wrapper = await mountPanel()

    expect(row(wrapper, 5).findAll('option').length).toBeGreaterThan(1)
  })

  it.each([
    ['podium_taken', 409, 'games.errors.podiumTaken'],
    ['room_full', 409, 'games.errors.roomFull'],
    ['game_not_pending', 409, 'games.errors.gameNotPending'],
    ['podium_not_in_room', 400, 'games.errors.podiumNotInRoom'],
    ['registration_not_found', 404, 'games.errors.registrationNotFound'],
  ])('shows the translated %s error and reads the list again', async (code, status, key) => {
    setRegistrations([fusees])
    mockServiceFailure(acceptGameRegistrationServiceMock, code, status)

    const wrapper = await mountPanel()

    await rowButton(wrapper, 5, 'game-join-accept').trigger('click')
    await flushPromises()

    expect(find(wrapper, 'game-join-action-error').text()).toBe(key)
    expect(row(wrapper, 5).exists()).toBe(true)
    expect(wrapper.emitted('changed')).toBeUndefined()
    expect(listGameRegistrationsServiceMock).toHaveBeenCalledTimes(2)
  })

  it('shows a server error when the call itself throws', async () => {
    setRegistrations([fusees])
    acceptGameRegistrationServiceMock.mockRejectedValue(new Error('boom'))

    const wrapper = await mountPanel()

    await rowButton(wrapper, 5, 'game-join-accept').trigger('click')
    await flushPromises()

    expect(find(wrapper, 'game-join-action-error').text()).toBe('games.errors.serverError')
  })

  it('refuses a request: it disappears and nothing is created', async () => {
    setRegistrations([fusees, comètes])

    const wrapper = await mountPanel()

    await rowButton(wrapper, 6, 'game-join-refuse').trigger('click')
    await flushPromises()

    expect(refuseGameRegistrationServiceMock).toHaveBeenCalledWith(COMPANY_ID, GAME_ID, 6)
    expect(acceptGameRegistrationServiceMock).not.toHaveBeenCalled()
    expect(row(wrapper, 6).exists()).toBe(false)
    expect(row(wrapper, 5).exists()).toBe(true)
    expect(wrapper.emitted('changed')).toBeUndefined()
  })

  it('shows the translated error when a refusal fails', async () => {
    setRegistrations([fusees])
    mockServiceFailure(refuseGameRegistrationServiceMock, 'registration_not_found', 404)

    const wrapper = await mountPanel()

    await rowButton(wrapper, 5, 'game-join-refuse').trigger('click')
    await flushPromises()

    expect(find(wrapper, 'game-join-action-error').text()).toBe('games.errors.registrationNotFound')
  })

  it('does one action at a time', async () => {
    setRegistrations([fusees, comètes])
    acceptGameRegistrationServiceMock.mockReturnValue(new Promise(() => {}))

    const wrapper = await mountPanel()

    await rowButton(wrapper, 5, 'game-join-accept').trigger('click')

    expect(rowButton(wrapper, 6, 'game-join-accept').attributes('disabled')).toBeDefined()
    expect(rowButton(wrapper, 6, 'game-join-refuse').attributes('disabled')).toBeDefined()
  })

  it('does not offer a podium already taken by a validated player', async () => {
    setRegistrations([fusees])

    const wrapper = await mountPanel(
      createGame({ participants: [createParticipantFixture({ podium: 1 })] })
    )

    // La liste déroulante réelle grise l'option : le panneau la lui désigne comme désactivée.
    const select = wrapper.findComponent({ name: 'SelectField' })
    const options = select.props('options') as Array<{ value: string; disabled?: boolean }>

    expect(options.find((option) => option.value === '1')?.disabled).toBe(true)
    expect(options.find((option) => option.value === '2')?.disabled).toBe(false)
  })
})

describe('views/games/detail/GameJoinPanel.vue: join link', () => {
  it('shows the link, copies it and tells when it expires', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)

    vi.stubGlobal('navigator', { clipboard: { writeText } })

    const wrapper = await mountPanel()

    expect(wrapper.get<HTMLInputElement>('[data-test="game-join-url"]').element.value).toBe(
      'https://quizz.example/rejoindre/#jeton'
    )
    expect(find(wrapper, 'game-join-expires').text()).toContain('gameJoin.linkExpires')

    await find(wrapper, 'game-join-copy').trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith('https://quizz.example/rejoindre/#jeton')
    expect(find(wrapper, 'game-join-copy').text()).toBe('gameJoin.copied')
  })

  it('does not claim a copy when the clipboard refuses', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })

    const wrapper = await mountPanel()

    await find(wrapper, 'game-join-copy').trigger('click')
    await flushPromises()

    expect(find(wrapper, 'game-join-copy').text()).toBe('gameJoin.copy')
  })

  it('completes a relative link with the origin of the backoffice', async () => {
    const wrapper = await mountPanel(
      createGame({ join: createJoinFixture({ url: '/rejoindre/#jeton' }) })
    )

    expect(wrapper.get<HTMLInputElement>('[data-test="game-join-url"]').element.value).toBe(
      `${window.location.origin}/rejoindre/#jeton`
    )
  })

  it('offers to open the link when none is open, then shows it', async () => {
    const wrapper = await mountPanel(createGame({ join: null }))

    expect(find(wrapper, 'game-join-url').exists()).toBe(false)
    expect(find(wrapper, 'game-join-closed').exists()).toBe(true)

    await find(wrapper, 'game-join-open').trigger('click')
    await flushPromises()

    expect(openGameJoinServiceMock).toHaveBeenCalledWith(COMPANY_ID, GAME_ID)
    expect(find(wrapper, 'game-join-url').exists()).toBe(true)
    expect(find(wrapper, 'game-join-closed').exists()).toBe(false)
  })

  it('treats a link past its expiry as closed', async () => {
    const wrapper = await mountPanel(
      createGame({ join: createJoinFixture({ expiresAt: '2026-11-24T09:59:00.000Z' }) })
    )

    expect(find(wrapper, 'game-join-url').exists()).toBe(false)
    expect(find(wrapper, 'game-join-open').exists()).toBe(true)
  })

  it('regenerates the link and shows the new one', async () => {
    openGameJoinServiceMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { join: createJoinFixture({ url: 'https://quizz.example/rejoindre/#nouveau' }) },
    })

    const wrapper = await mountPanel()

    await find(wrapper, 'game-join-regenerate').trigger('click')
    await flushPromises()

    expect(openGameJoinServiceMock).toHaveBeenCalledWith(COMPANY_ID, GAME_ID)
    expect(wrapper.get<HTMLInputElement>('[data-test="game-join-url"]').element.value).toBe(
      'https://quizz.example/rejoindre/#nouveau'
    )
  })

  it('closes the link', async () => {
    const wrapper = await mountPanel()

    await find(wrapper, 'game-join-close').trigger('click')
    await flushPromises()

    expect(closeGameJoinServiceMock).toHaveBeenCalledWith(COMPANY_ID, GAME_ID)
    expect(find(wrapper, 'game-join-url').exists()).toBe(false)
    expect(find(wrapper, 'game-join-open').exists()).toBe(true)
  })

  it('keeps the link and shows the translated error when it cannot be closed', async () => {
    mockServiceFailure(closeGameJoinServiceMock, 'forbidden', 403)

    const wrapper = await mountPanel()

    await find(wrapper, 'game-join-close').trigger('click')
    await flushPromises()

    expect(find(wrapper, 'game-join-url').exists()).toBe(true)
    expect(find(wrapper, 'game-join-action-error').text()).toBe('games.errors.forbidden')
  })

  it('shows game_not_pending when the link cannot be opened any more', async () => {
    mockServiceFailure(openGameJoinServiceMock, 'game_not_pending', 409)

    const wrapper = await mountPanel(createGame({ join: null }))

    await find(wrapper, 'game-join-open').trigger('click')
    await flushPromises()

    expect(find(wrapper, 'game-join-action-error').text()).toBe('games.errors.gameNotPending')
    expect(find(wrapper, 'game-join-url').exists()).toBe(false)
  })

  it('follows the link of the game when the page reloads it', async () => {
    const wrapper = await mountPanel()

    await wrapper.setProps({
      game: createGame({
        join: createJoinFixture({ url: 'https://quizz.example/rejoindre/#autre' }),
      }),
    })

    expect(wrapper.get<HTMLInputElement>('[data-test="game-join-url"]').element.value).toBe(
      'https://quizz.example/rejoindre/#autre'
    )
  })
})

const screen = () => document.body.querySelector('[data-test="game-join-screen"]')
const screenPart = (name: string) => document.body.querySelector(`[data-test="${name}"]`)

function pressEscape(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}

describe('views/games/detail/GameJoinPanel.vue: QR code', () => {
  it('shows the QR code of the server as an image whose address is the encoded SVG', async () => {
    const wrapper = await mountPanel()
    const img = wrapper.get<HTMLImageElement>('[data-test="game-join-qr"]')
    const src = img.attributes('src') ?? ''

    expect(img.element.tagName).toBe('IMG')
    expect(src.startsWith('data:image/svg+xml')).toBe(true)
    expect(decodeURIComponent(src.slice(src.indexOf(',') + 1))).toBe(JOIN_QR_SVG)
    expect(img.attributes('alt')).toBe('gameJoin.qrAlt')
    expect(find(wrapper, 'game-join-qr-help').exists()).toBe(false)
  })

  it('never injects the SVG of the server into the page', async () => {
    const hostile = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    const wrapper = await mountPanel(createGame({ join: createJoinFixture({ qrSvg: hostile }) }))
    const src = wrapper.get('[data-test="game-join-qr"]').attributes('src') ?? ''

    expect(src).not.toContain('<')
    expect(wrapper.find('svg').exists()).toBe(false)
    expect(wrapper.find('script').exists()).toBe(false)
  })

  it.each([{ qrSvg: null }, { qrSvg: undefined }])(
    'keeps the copyable link and explains the missing QR code when it is %j',
    async (qr) => {
      const join = createJoinFixture(qr)

      if (qr.qrSvg === undefined) {
        delete join.qrSvg
      }

      const wrapper = await mountPanel(createGame({ join }))

      expect('qrSvg' in join).toBe(qr.qrSvg === null)
      expect(find(wrapper, 'game-join-url').exists()).toBe(true)
      expect(find(wrapper, 'game-join-copy').exists()).toBe(true)
      expect(find(wrapper, 'game-join-qr').exists()).toBe(false)
      expect(find(wrapper, 'game-join-fullscreen').exists()).toBe(false)
      expect(find(wrapper, 'game-join-qr-help').text()).toBe('gameJoin.qrUnavailable')
    }
  )

  it('shows the QR code of a link opened or regenerated from the panel', async () => {
    openGameJoinServiceMock.mockResolvedValue({
      ok: true,
      status: 201,
      data: { join: createJoinFixture({ qrSvg: '<svg id="nouveau"/>' }) },
    })

    const wrapper = await mountPanel(createGame({ join: null }))

    expect(find(wrapper, 'game-join-qr').exists()).toBe(false)

    await find(wrapper, 'game-join-open').trigger('click')
    await flushPromises()

    const src = wrapper.get('[data-test="game-join-qr"]').attributes('src') ?? ''

    expect(decodeURIComponent(src.slice(src.indexOf(',') + 1))).toBe('<svg id="nouveau"/>')
  })

  describe('full screen', () => {
    it('is closed at first, then shows the big QR code and the name of the game', async () => {
      const wrapper = await mountPanel(createGame({ roomName: 'Salle Pirate' }))

      expect(screen()).toBeNull()

      await find(wrapper, 'game-join-fullscreen').trigger('click')
      await flushPromises()

      expect(screen()).not.toBeNull()
      expect(screenPart('game-join-screen-title')?.textContent).toContain('Salle Pirate')
      expect(screenPart('game-join-screen-qr')?.getAttribute('src')).toBe(
        wrapper.get('[data-test="game-join-qr"]').attributes('src')
      )
      expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
    })

    it('closes with the Escape key', async () => {
      const wrapper = await mountPanel()

      await find(wrapper, 'game-join-fullscreen').trigger('click')
      await flushPromises()
      pressEscape()
      await flushPromises()

      expect(screen()).toBeNull()
    })

    it('ignores the other keys', async () => {
      const wrapper = await mountPanel()

      await find(wrapper, 'game-join-fullscreen').trigger('click')
      await flushPromises()
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
      await flushPromises()

      expect(screen()).not.toBeNull()
    })

    it('closes with its button', async () => {
      const wrapper = await mountPanel()

      await find(wrapper, 'game-join-fullscreen').trigger('click')
      await flushPromises()
      screenPart('game-join-screen-close')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      )
      await flushPromises()

      expect(screen()).toBeNull()
    })

    it('closes with a click beside the dialog, not on the QR code itself', async () => {
      const wrapper = await mountPanel()

      await find(wrapper, 'game-join-fullscreen').trigger('click')
      await flushPromises()
      screenPart('game-join-screen-qr')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()

      expect(screen()).not.toBeNull()

      screen()?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()

      expect(screen()).toBeNull()
    })

    it('can be opened again after being closed', async () => {
      const wrapper = await mountPanel()

      await find(wrapper, 'game-join-fullscreen').trigger('click')
      await flushPromises()
      pressEscape()
      await flushPromises()
      await find(wrapper, 'game-join-fullscreen').trigger('click')
      await flushPromises()

      expect(screen()).not.toBeNull()
    })

    it('closes by itself when the link is closed, and does not come back with a new link', async () => {
      const wrapper = await mountPanel()

      await find(wrapper, 'game-join-fullscreen').trigger('click')
      await flushPromises()
      await wrapper.setProps({ game: createGame({ join: null }) })
      await flushPromises()

      expect(screen()).toBeNull()

      await wrapper.setProps({ game: createGame() })
      await flushPromises()

      expect(screen()).toBeNull()
    })

    it('closes by itself once the game is launched', async () => {
      const wrapper = await mountPanel()

      await find(wrapper, 'game-join-fullscreen').trigger('click')
      await flushPromises()
      await wrapper.setProps({ game: createGame({ state: GAME_STATE_RUNNING }) })
      await flushPromises()

      expect(screen()).toBeNull()
    })

    it('removes the Escape listener when the panel is destroyed while open', async () => {
      const removeListener = vi.spyOn(document, 'removeEventListener')
      const wrapper = await mountPanel()

      await find(wrapper, 'game-join-fullscreen').trigger('click')
      await flushPromises()
      wrapper.unmount()

      expect(removeListener).toHaveBeenCalledWith('keydown', expect.any(Function))
      expect(screen()).toBeNull()
    })
  })
})
