import {
  createGameFixture,
  createParticipantFixture,
} from '@frontend-tests/_helpers/gamesServiceMock'
import {
  liveNowMock,
  liveRoomsMock,
  liveStateMock,
  setLiveRooms,
  useLiveCompanyMock,
} from '@frontend-tests/_helpers/liveCompanyMock'
import { createRoomLive } from '@frontend-tests/_helpers/liveMock'
import { mountWithFrontendMocks, tWithParamsMock } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import {
  GAME_STATE_FINISHED,
  GAME_STATE_RUNNING,
  MINI_GAME_FIRST_BUZZ,
  ROOM_PRESENCE,
  type RoomStatusReport,
} from '@quizzup/shared'
import type { VueWrapper } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import type { Game } from '@/types/game'
import GameLivePanel from '@/views/games/detail/GameLivePanel.vue'

// Les nombres du panneau passent par `t` du script : on veut les lire dans le texte.
vi.mock('vue-i18n', async () => {
  const i18n = await import('@frontend-tests/_helpers/i18nMock')

  return {
    ...i18n,
    useI18n: () => ({ ...i18n.useI18n(), t: tWithParamsMock }),
  }
})

resetFrontendMocksBeforeEach()

const GAME_ID = 4
const ROOM_ID = 10

function createGame(overrides: Partial<Game> = {}): Game {
  return createGameFixture({
    id: GAME_ID,
    roomId: ROOM_ID,
    companyId: 1,
    state: GAME_STATE_RUNNING,
    roundsCount: 5,
    questionsPerRound: 8,
    participants: [
      createParticipantFixture({ id: 1, podium: 1, displayName: 'Les Quizzeurs', score: 0 }),
      createParticipantFixture({
        id: 2,
        podium: 2,
        displayName: 'Alex',
        secondPlayer: {
          displayName: 'Sam',
          email: null,
          hasEmail: false,
          consentAt: null,
          marketingConsent: false,
        },
      }),
    ],
    ...overrides,
  })
}

function createStatus(overrides: Partial<RoomStatusReport> = {}): RoomStatusReport {
  return {
    screen: 'play',
    gameId: GAME_ID,
    phase: 'question',
    round: 2,
    questionIndex: 2,
    miniGame: MINI_GAME_FIRST_BUZZ,
    paused: false,
    scores: [
      { podium: 1, score: 30 },
      { podium: 2, score: 10 },
    ],
    audioReady: true,
    ...overrides,
  }
}

function publish(
  status: RoomStatusReport | null,
  room: Parameters<typeof createRoomLive>[0] = {}
): void {
  setLiveRooms([createRoomLive({ roomId: ROOM_ID, status, ...room })])
}

function mountPanel(game: Game = createGame()): VueWrapper {
  return mountWithFrontendMocks(GameLivePanel, { props: { game } })
}

const panel = (wrapper: VueWrapper) => wrapper.find('[data-test="game-live-panel"]')

describe('views/games/detail/GameLivePanel.vue', () => {
  it('shows presence, step and scores of the game played by the room', () => {
    publish(createStatus())

    const wrapper = mountPanel()

    expect(panel(wrapper).exists()).toBe(true)
    expect(wrapper.get('[data-test="game-live-presence"]').attributes('data-presence')).toBe(
      'online'
    )
    expect(wrapper.get('[data-test="game-live-phase"]').text()).toBe('live.phase.question')
    expect(wrapper.get('[data-test="game-live-round"]').text()).toContain('"round":2,"total":5')
    // L'indice de la salle part de 0 : la 3e question s'affiche « 3 ».
    expect(wrapper.get('[data-test="game-live-question"]').text()).toContain(
      '"question":3,"total":8'
    )
    expect(wrapper.get('[data-test="game-live-mini-game"]').text()).toBe(
      `games.miniGames.${MINI_GAME_FIRST_BUZZ}`
    )
    expect(wrapper.get('[data-test="game-live-score-1"]').text()).toContain('Les Quizzeurs')
    expect(wrapper.get('[data-test="game-live-score-1"]').text()).toContain('30')
    expect(wrapper.get('[data-test="game-live-score-2"]').text()).toContain('Alex · Sam')
    expect(wrapper.get('[data-test="game-live-score-2"]').text()).toContain('10')
    expect(wrapper.find('[data-test="game-live-paused"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="game-live-stale"]').exists()).toBe(false)
  })

  it('follows the room with the company of the game, and only while the game is not over', () => {
    publish(createStatus())

    mountPanel()
    const companyOf = useLiveCompanyMock.mock.calls[0]?.[0] as () => number | null

    expect(companyOf()).toBe(1)

    useLiveCompanyMock.mockClear()
    mountPanel(createGame({ state: GAME_STATE_FINISHED }))

    expect((useLiveCompanyMock.mock.calls[0]?.[0] as () => number | null)()).toBeNull()
  })

  it('is absent when the room plays another game', () => {
    publish(createStatus({ gameId: GAME_ID + 1 }))

    expect(panel(mountPanel()).exists()).toBe(false)
  })

  it('is absent when the room plays no game, has no report or is another room', () => {
    publish(createStatus({ gameId: null, phase: null, scores: [] }))
    expect(panel(mountPanel()).exists()).toBe(false)

    publish(null)
    expect(panel(mountPanel()).exists()).toBe(false)

    setLiveRooms([createRoomLive({ roomId: ROOM_ID + 1, status: createStatus() })])
    expect(panel(mountPanel()).exists()).toBe(false)
  })

  it('shows the pause, announced politely with the presence', () => {
    publish(createStatus({ paused: true }))

    const wrapper = mountPanel()
    const presence = wrapper.get('[data-test="game-live-presence"]')

    expect(presence.attributes('aria-live')).toBe('polite')
    expect(presence.find('[data-test="game-live-paused"]').text()).toBe('live.panel.paused')
  })

  it('marks an offline room, shows when it was seen and keeps the last values', () => {
    liveNowMock.value = Date.parse('2026-11-23T10:05:00.000Z')
    publish(createStatus({ paused: true }), {
      presence: ROOM_PRESENCE.OFFLINE,
      controllable: false,
      lastSeenAt: '2026-11-23T10:00:00.000Z',
    })

    const wrapper = mountPanel()

    expect(wrapper.get('[data-test="game-live-presence"]').attributes('data-presence')).toBe(
      'offline'
    )
    expect(wrapper.get('[data-test="game-live-seen"]').text()).toContain('live.presence.seenAgo')
    expect(wrapper.find('[data-test="game-live-stale"]').exists()).toBe(true)
    // La pause d'une salle qu'on ne voit plus n'est pas fiable.
    expect(wrapper.find('[data-test="game-live-paused"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="game-live-score-1"]').text()).toContain('30')
  })

  it('does not claim anything while the live stream is down', () => {
    liveStateMock.value = 'reconnecting'
    publish(createStatus())

    const wrapper = mountPanel()

    expect(wrapper.get('[data-test="game-live-presence"]').attributes('data-presence')).toBe(
      'unknown'
    )
    expect(wrapper.find('[data-test="game-live-stale"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="live-connection-note"]').text()).toBe(
      'live.connection.reconnecting'
    )
  })

  it('shows dashes between questions and an empty message without scores', () => {
    publish(
      createStatus({ phase: 'lobby', round: null, questionIndex: null, miniGame: null, scores: [] })
    )

    const wrapper = mountPanel()

    expect(wrapper.get('[data-test="game-live-round"]').text()).toBe('—')
    expect(wrapper.get('[data-test="game-live-question"]').text()).toBe('—')
    expect(wrapper.get('[data-test="game-live-mini-game"]').text()).toBe('—')
    expect(wrapper.get('[data-test="game-live-no-scores"]').text()).toBe('live.panel.noScores')
  })

  it('shows a dash for a desk that has no named player in the game', () => {
    publish(createStatus({ scores: [{ podium: 3, score: 5 }] }))

    expect(mountPanel().get('[data-test="game-live-score-3"]').text()).toContain('—')
  })

  it('updates the scores and the step on each report, outside the announced zone', async () => {
    publish(createStatus())

    const wrapper = mountPanel()

    publish(
      createStatus({
        questionIndex: 3,
        scores: [
          { podium: 1, score: 40 },
          { podium: 2, score: 10 },
        ],
      })
    )
    await nextTick()

    expect(wrapper.get('[data-test="game-live-score-1"]').text()).toContain('40')
    expect(wrapper.get('[data-test="game-live-question"]').text()).toContain('"question":4')
    expect(wrapper.get('[data-test="game-live-score-1"]').element.closest('[aria-live]')).toBeNull()

    liveRoomsMock.value = {}
    await nextTick()

    expect(panel(wrapper).exists()).toBe(false)
  })
})
