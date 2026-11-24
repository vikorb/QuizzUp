import { confirmMock, setConfirmResult } from '@frontend-tests/_helpers/confirmMock'
import { createDeferred, createRoomLive } from '@frontend-tests/_helpers/liveMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { GAME_COMMAND_REFUSALS, MINI_GAME_FIRST_BUZZ, type RoomStatusReport } from '@quizzup/shared'
import type { VueWrapper } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import type { RoomCommandOutcome } from '@/composables/useLiveCompany'
import GameLiveControls from '@/views/games/detail/GameLiveControls.vue'

resetFrontendMocksBeforeEach()

const GAME_ID = 4
const ROOM_ID = 10

function createStatus(overrides: Partial<RoomStatusReport> = {}): RoomStatusReport {
  return {
    screen: 'play',
    gameId: GAME_ID,
    phase: 'question',
    round: 2,
    questionIndex: 2,
    miniGame: MINI_GAME_FIRST_BUZZ,
    paused: false,
    scores: [],
    audioReady: true,
    ...overrides,
  }
}

type SendMock = ReturnType<typeof createSend>

function createSend(outcome: RoomCommandOutcome = { result: 'applied' }) {
  return vi.fn(async (_roomId: number, _command: unknown): Promise<RoomCommandOutcome> => outcome)
}

function mountControls(
  props: {
    status?: Partial<RoomStatusReport>
    controllable?: boolean
    uncertain?: boolean
    send?: SendMock
  } = {}
): { wrapper: VueWrapper; send: SendMock } {
  const send = props.send ?? createSend()
  const wrapper = mountWithFrontendMocks(GameLiveControls, {
    props: {
      room: createRoomLive({ roomId: ROOM_ID, controllable: props.controllable ?? true }),
      status: createStatus(props.status),
      uncertain: props.uncertain ?? false,
      send,
    },
  })

  return { wrapper, send }
}

const button = (wrapper: VueWrapper, name: 'toggle-pause' | 'skip' | 'abort') =>
  wrapper.get(`[data-test="game-live-${name}"]`)
const isDisabled = (wrapper: VueWrapper, name: 'toggle-pause' | 'skip' | 'abort') =>
  button(wrapper, name).attributes('disabled') !== undefined
const reason = (wrapper: VueWrapper) => wrapper.find('[data-test="game-live-controls-reason"]')
const feedback = (wrapper: VueWrapper) => wrapper.find('[data-test="game-live-command-feedback"]')

/** Laisse les promesses du clic (confirmation, envoi) se résoudre. */
const flush = async (): Promise<void> => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('views/games/detail/GameLiveControls.vue', () => {
  it('offers the three commands, all enabled and without reason, on a question in progress', () => {
    const { wrapper } = mountControls()

    expect(button(wrapper, 'toggle-pause').text()).toBe('live.command.pause')
    expect(button(wrapper, 'skip').text()).toBe('live.command.skip')
    expect(button(wrapper, 'abort').text()).toBe('live.command.abort')
    expect(isDisabled(wrapper, 'toggle-pause')).toBe(false)
    expect(isDisabled(wrapper, 'skip')).toBe(false)
    expect(isDisabled(wrapper, 'abort')).toBe(false)
    expect(reason(wrapper).exists()).toBe(false)
    expect(feedback(wrapper).exists()).toBe(false)
  })

  it('sends « pause » to the room of the panel', async () => {
    const { wrapper, send } = mountControls()

    await button(wrapper, 'toggle-pause').trigger('click')
    await flush()

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(ROOM_ID, { command: 'pause' })
  })

  it('shows « Reprendre » and sends « resume » when the room reports the pause', async () => {
    const { wrapper, send } = mountControls({ status: { paused: true } })

    expect(button(wrapper, 'toggle-pause').text()).toBe('live.command.resume')

    await button(wrapper, 'toggle-pause').trigger('click')
    await flush()

    expect(send).toHaveBeenCalledWith(ROOM_ID, { command: 'resume' })
  })

  it('sends « skip » with the round and the question index reported by the room', async () => {
    const { wrapper, send } = mountControls({ status: { round: 3, questionIndex: 7 } })

    await button(wrapper, 'skip').trigger('click')
    await flush()

    expect(send).toHaveBeenCalledWith(ROOM_ID, { command: 'skip', round: 3, questionIndex: 7 })
  })

  it('asks for confirmation before « abort », then sends it with the game id', async () => {
    const { wrapper, send } = mountControls()

    await button(wrapper, 'abort').trigger('click')
    await flush()

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'danger',
        title: 'live.command.abortTitle',
        message: 'live.command.abortConfirm',
      })
    )
    expect(send).toHaveBeenCalledWith(ROOM_ID, { command: 'abort', gameId: GAME_ID })
  })

  it('sends nothing when the confirmation of « abort » is cancelled', async () => {
    setConfirmResult(false)

    const { wrapper, send } = mountControls()

    await button(wrapper, 'abort').trigger('click')
    await flush()

    expect(confirmMock).toHaveBeenCalledTimes(1)
    expect(send).not.toHaveBeenCalled()
    expect(feedback(wrapper).exists()).toBe(false)
    // La confirmation refusée libère les boutons.
    expect(isDisabled(wrapper, 'toggle-pause')).toBe(false)
  })

  it.each([
    ['the live stream is not open', { uncertain: true }, 'live.command.disabled.stream'],
    ['the room is offline', { controllable: false }, 'live.command.disabled.offline'],
    [
      'the room screen is not the game',
      { status: { screen: 'lobby' } },
      'live.command.disabled.screen',
    ],
    ['the room is in the lobby', { status: { phase: 'lobby' } }, 'live.command.disabled.noGame'],
    ['the game is over', { status: { phase: 'finished' } }, 'live.command.disabled.noGame'],
    ['the game is stopped', { status: { phase: 'aborted' } }, 'live.command.disabled.noGame'],
    ['the room has no phase', { status: { phase: null } }, 'live.command.disabled.noGame'],
  ] as const)('disables everything and says why when %s', async (_name, props, key) => {
    const { wrapper, send } = mountControls(props as Parameters<typeof mountControls>[0])

    expect(isDisabled(wrapper, 'toggle-pause')).toBe(true)
    expect(isDisabled(wrapper, 'skip')).toBe(true)
    expect(isDisabled(wrapper, 'abort')).toBe(true)
    expect(reason(wrapper).text()).toBe(key)

    await button(wrapper, 'abort').trigger('click')
    await flush()

    expect(send).not.toHaveBeenCalled()
    expect(confirmMock).not.toHaveBeenCalled()
  })

  it('keeps the stream reason first when the room is also offline', () => {
    const { wrapper } = mountControls({ uncertain: true, controllable: false })

    expect(reason(wrapper).text()).toBe('live.command.disabled.stream')
  })

  it('disables only « skip » during the pause, and says why', () => {
    const { wrapper } = mountControls({ status: { paused: true } })

    expect(isDisabled(wrapper, 'skip')).toBe(true)
    expect(isDisabled(wrapper, 'toggle-pause')).toBe(false)
    expect(isDisabled(wrapper, 'abort')).toBe(false)
    expect(reason(wrapper).text()).toBe('live.command.disabled.skipPaused')
  })

  it.each(['reveal', 'round_intro', 'theme_choice', 'round_summary'] as const)(
    'disables only « skip » in the phase %s, which has no question to skip',
    (phase) => {
      const { wrapper } = mountControls({ status: { phase, round: null, questionIndex: null } })

      expect(isDisabled(wrapper, 'skip')).toBe(true)
      expect(isDisabled(wrapper, 'toggle-pause')).toBe(false)
      expect(isDisabled(wrapper, 'abort')).toBe(false)
      expect(reason(wrapper).text()).toBe('live.command.disabled.skipPhase')
    }
  )

  it('disables « skip » when the question is in progress but the room did not report it', () => {
    const { wrapper } = mountControls({ status: { round: null, questionIndex: null } })

    expect(isDisabled(wrapper, 'skip')).toBe(true)
  })

  it('sends one command at a time: a second click is ignored and all buttons wait', async () => {
    const gate = createDeferred<RoomCommandOutcome>()
    const send = vi.fn((_roomId: number, _command: unknown) => gate.promise)
    const { wrapper } = mountControls({ send })

    await button(wrapper, 'toggle-pause').trigger('click')
    await button(wrapper, 'toggle-pause').trigger('click')
    await button(wrapper, 'skip').trigger('click')

    expect(send).toHaveBeenCalledTimes(1)
    expect(isDisabled(wrapper, 'toggle-pause')).toBe(true)
    expect(isDisabled(wrapper, 'skip')).toBe(true)
    expect(isDisabled(wrapper, 'abort')).toBe(true)

    gate.resolve({ result: 'applied' })
    await flush()

    expect(isDisabled(wrapper, 'toggle-pause')).toBe(false)
    expect(feedback(wrapper).text()).toBe('live.command.result.applied')
  })

  it('shows the success, politely announced', async () => {
    const { wrapper } = mountControls()

    await button(wrapper, 'toggle-pause').trigger('click')
    await flush()

    expect(feedback(wrapper).attributes('role')).toBe('status')
    expect(feedback(wrapper).attributes('data-tone')).toBe('ok')
    expect(feedback(wrapper).text()).toBe('live.command.result.applied')
  })

  it.each(GAME_COMMAND_REFUSALS)(
    'shows the translated reason of the refusal « %s »',
    async (refusal) => {
      const { wrapper } = mountControls({
        send: createSend({ result: 'refused', reason: refusal }),
      })

      await button(wrapper, 'toggle-pause').trigger('click')
      await flush()

      expect(feedback(wrapper).attributes('role')).toBe('alert')
      expect(feedback(wrapper).attributes('data-tone')).toBe('error')
      expect(feedback(wrapper).text()).toBe(`live.command.refusal.${refusal}`)
    }
  )

  it('shows a generic refusal when the room gave no usable reason', async () => {
    const { wrapper } = mountControls({ send: createSend({ result: 'refused' }) })

    await button(wrapper, 'toggle-pause').trigger('click')
    await flush()

    expect(feedback(wrapper).text()).toBe('live.command.result.refused')
  })

  it('tells that the room did not answer when the command expires', async () => {
    const { wrapper } = mountControls({ send: createSend({ result: 'expired' }) })

    await button(wrapper, 'toggle-pause').trigger('click')
    await flush()

    expect(feedback(wrapper).attributes('role')).toBe('alert')
    expect(feedback(wrapper).text()).toBe('live.command.result.expired')
  })

  it('shows the translated HTTP error, then clears it when the next command starts', async () => {
    const send = createSend({ result: 'error', code: 'room_not_controllable' })
    const { wrapper } = mountControls({ send })

    await button(wrapper, 'toggle-pause').trigger('click')
    await flush()

    expect(feedback(wrapper).text()).toBe('live.command.error.room_not_controllable')
    expect(feedback(wrapper).attributes('role')).toBe('alert')

    send.mockImplementationOnce(() => new Promise(() => undefined))
    await button(wrapper, 'toggle-pause').trigger('click')

    expect(feedback(wrapper).exists()).toBe(false)
  })
})
