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

type ButtonName = 'toggle-pause' | 'skip'

const button = (wrapper: VueWrapper, name: ButtonName) =>
  wrapper.get(`[data-test="game-live-${name}"]`)
const isDisabled = (wrapper: VueWrapper, name: ButtonName) =>
  button(wrapper, name).attributes('disabled') !== undefined
/** Attente d'une commande : le bouton garde le focus clavier mais refuse le clic. */
const isWaiting = (wrapper: VueWrapper, name: ButtonName) =>
  button(wrapper, name).attributes('aria-disabled') === 'true'
const reason = (wrapper: VueWrapper) => wrapper.find('[data-test="game-live-controls-reason"]')
const feedback = (wrapper: VueWrapper) => wrapper.find('[data-test="game-live-command-feedback"]')
const liveRegion = (wrapper: VueWrapper) => wrapper.get('[aria-live="polite"]')

/** Laisse les promesses du clic (envoi) se résoudre. */
const flush = async (): Promise<void> => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('views/games/detail/GameLiveControls.vue', () => {
  it('offers pause and skip, enabled and without reason, on a question in progress', () => {
    const { wrapper } = mountControls()

    expect(button(wrapper, 'toggle-pause').text()).toBe('live.command.pause')
    expect(button(wrapper, 'skip').text()).toBe('live.command.skip')
    expect(isDisabled(wrapper, 'toggle-pause')).toBe(false)
    expect(isDisabled(wrapper, 'skip')).toBe(false)
    expect(reason(wrapper).exists()).toBe(false)
    expect(feedback(wrapper).exists()).toBe(false)
  })

  it('offers no way to stop the game: the header button of the sheet does it', () => {
    const { wrapper } = mountControls()

    expect(wrapper.findAll('button')).toHaveLength(2)
    expect(wrapper.find('[data-test="game-live-abort"]').exists()).toBe(false)
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

  it.each([
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
    expect(reason(wrapper).text()).toBe(key)

    const id = reason(wrapper).attributes('id')

    expect(id).toBeTruthy()
    expect(button(wrapper, 'toggle-pause').attributes('aria-describedby')).toBe(id)
    expect(button(wrapper, 'skip').attributes('aria-describedby')).toBe(id)

    await button(wrapper, 'toggle-pause').trigger('click')
    await flush()

    expect(send).not.toHaveBeenCalled()
  })

  it.each([{}, { controllable: false }])(
    'disables everything when the stream is cut, without repeating the connection note (%o)',
    async (props) => {
      const { wrapper, send } = mountControls({ uncertain: true, ...props })

      expect(isDisabled(wrapper, 'toggle-pause')).toBe(true)
      expect(isDisabled(wrapper, 'skip')).toBe(true)
      expect(reason(wrapper).exists()).toBe(false)
      expect(button(wrapper, 'toggle-pause').attributes('aria-describedby')).toBeUndefined()
      expect(button(wrapper, 'skip').attributes('aria-describedby')).toBeUndefined()

      await button(wrapper, 'skip').trigger('click')

      expect(send).not.toHaveBeenCalled()
    }
  )

  it('disables only « skip » during the pause, and says why', () => {
    const { wrapper } = mountControls({ status: { paused: true } })

    expect(isDisabled(wrapper, 'skip')).toBe(true)
    expect(isDisabled(wrapper, 'toggle-pause')).toBe(false)
    expect(reason(wrapper).text()).toBe('live.command.disabled.skipPaused')
    expect(button(wrapper, 'skip').attributes('aria-describedby')).toBe(
      reason(wrapper).attributes('id')
    )
    expect(button(wrapper, 'toggle-pause').attributes('aria-describedby')).toBeUndefined()
  })

  it.each(['reveal', 'round_intro', 'theme_choice', 'round_summary'] as const)(
    'disables only « skip » in the phase %s, which has no question to skip',
    (phase) => {
      const { wrapper } = mountControls({ status: { phase, round: null, questionIndex: null } })

      expect(isDisabled(wrapper, 'skip')).toBe(true)
      expect(isDisabled(wrapper, 'toggle-pause')).toBe(false)
      expect(reason(wrapper).text()).toBe('live.command.disabled.skipPhase')
    }
  )

  it('disables « skip » when the question is in progress but the room did not report it', () => {
    const { wrapper } = mountControls({ status: { round: null, questionIndex: null } })

    expect(isDisabled(wrapper, 'skip')).toBe(true)
  })

  it('sends one command at a time: a second click is ignored and the wait is told', async () => {
    const gate = createDeferred<RoomCommandOutcome>()
    const send = vi.fn((_roomId: number, _command: unknown) => gate.promise)
    const { wrapper } = mountControls({ send })

    await button(wrapper, 'toggle-pause').trigger('click')
    await button(wrapper, 'toggle-pause').trigger('click')
    await button(wrapper, 'skip').trigger('click')

    expect(send).toHaveBeenCalledTimes(1)
    // `aria-disabled` et non `disabled` : le bouton cliqué ne perd pas le focus clavier.
    expect(isWaiting(wrapper, 'toggle-pause')).toBe(true)
    expect(isWaiting(wrapper, 'skip')).toBe(true)
    expect(isDisabled(wrapper, 'toggle-pause')).toBe(false)
    expect(feedback(wrapper).text()).toBe('live.command.pending')

    gate.resolve({ result: 'applied' })
    await flush()

    expect(isWaiting(wrapper, 'toggle-pause')).toBe(false)
    expect(feedback(wrapper).text()).toBe('live.command.result.applied')
  })

  it('keeps one polite live region in the page, whatever the content', async () => {
    const { wrapper } = mountControls({ send: createSend({ result: 'refused' }) })
    const region = liveRegion(wrapper).element

    expect(feedback(wrapper).exists()).toBe(false)

    await button(wrapper, 'toggle-pause').trigger('click')
    await flush()

    expect(liveRegion(wrapper).element).toBe(region)
    expect(region.contains(feedback(wrapper).element)).toBe(true)
  })

  it('clears the last feedback when the phase of the game changes', async () => {
    const { wrapper } = mountControls()

    await button(wrapper, 'toggle-pause').trigger('click')
    await flush()

    expect(feedback(wrapper).exists()).toBe(true)

    await wrapper.setProps({ status: createStatus({ phase: 'reveal' }) })

    expect(feedback(wrapper).exists()).toBe(false)
  })

  it('keeps the last feedback when the status changes but the phase does not', async () => {
    const { wrapper } = mountControls()

    await button(wrapper, 'toggle-pause').trigger('click')
    await flush()
    await wrapper.setProps({ status: createStatus({ paused: true }) })

    expect(feedback(wrapper).exists()).toBe(true)
  })

  it('shows the success', async () => {
    const { wrapper } = mountControls()

    await button(wrapper, 'toggle-pause').trigger('click')
    await flush()

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

    expect(feedback(wrapper).attributes('data-tone')).toBe('error')
    expect(feedback(wrapper).text()).toBe('live.command.result.expired')
  })

  it('shows the translated HTTP error, then clears it when the next command starts', async () => {
    const send = createSend({ result: 'error', code: 'room_not_controllable' })
    const { wrapper } = mountControls({ send })

    await button(wrapper, 'toggle-pause').trigger('click')
    await flush()

    expect(feedback(wrapper).text()).toBe('live.command.error.room_not_controllable')
    expect(feedback(wrapper).attributes('data-tone')).toBe('error')

    send.mockImplementationOnce(() => new Promise(() => undefined))
    await button(wrapper, 'toggle-pause').trigger('click')

    expect(feedback(wrapper).text()).toBe('live.command.pending')
  })
})
