import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  GAME_COMMAND_REFUSAL,
  GAME_IDLE_PHASES,
  LIVE_EVENT,
  LIVE_OFFLINE_AFTER_MS,
  ROOM_COMMAND_RESULT,
  ROOM_COMMAND_TIMEOUT_MS,
  ROOM_PRESENCE,
  type RoomLive,
  type RoomStatusReport,
} from '@quizzup/shared'
import { COMMAND_MAX_PER_ROOM, createLiveHub, type LiveHub } from '@backend/live/hub'

const idleReport: RoomStatusReport = {
  screen: 'launch',
  gameId: null,
  phase: null,
  round: null,
  questionIndex: null,
  miniGame: null,
  paused: false,
  scores: [],
  audioReady: true,
}

const playingReport: RoomStatusReport = {
  ...idleReport,
  screen: 'play',
  gameId: 12,
  phase: 'question',
  round: 2,
  questionIndex: 3,
  miniGame: 'quick_answer',
  scores: [{ podium: 1, score: 30 }],
}

function makeSink() {
  const events: Array<{ event: string; data: unknown }> = []
  const state = { closed: 0 }

  return {
    events,
    state,
    send: (event: string, data: unknown) => events.push({ event, data }),
    close: () => {
      state.closed += 1
    },
  }
}

let openedHub: LiveHub | undefined

function newHub() {
  const clock = { now: 1_000_000 }

  openedHub = createLiveHub({ now: () => clock.now })

  return { hub: openedHub, clock }
}

afterEach(() => {
  openedHub?.close()
  openedHub = undefined
  vi.useRealTimers()
})

describe('live hub presence', () => {
  it('knows nothing about a room that never reported: offline', () => {
    const { hub } = newHub()

    expect(hub.roomLive(1)).toEqual({
      roomId: 1,
      presence: ROOM_PRESENCE.OFFLINE,
      controllable: false,
      lastSeenAt: null,
      status: null,
    })
  })

  it('is online after a report, and offline once the silence reaches the limit', () => {
    const { hub, clock } = newHub()

    hub.report(1, 10, idleReport)

    expect(hub.roomLive(1)).toMatchObject({
      presence: ROOM_PRESENCE.ONLINE,
      lastSeenAt: new Date(clock.now).toISOString(),
      status: idleReport,
    })

    clock.now += LIVE_OFFLINE_AFTER_MS - 1
    expect(hub.roomLive(1).presence).toBe(ROOM_PRESENCE.ONLINE)

    clock.now += 1
    expect(hub.roomLive(1).presence).toBe(ROOM_PRESENCE.OFFLINE)
  })

  it('is in_game with a game and a phase other than lobby, finished or aborted', () => {
    const { hub } = newHub()

    hub.report(1, 10, playingReport)
    expect(hub.roomLive(1).presence).toBe(ROOM_PRESENCE.IN_GAME)

    for (const phase of GAME_IDLE_PHASES) {
      hub.report(1, 10, { ...playingReport, phase })
      expect(hub.roomLive(1).presence).toBe(ROOM_PRESENCE.ONLINE)
    }

    hub.report(1, 10, { ...playingReport, gameId: null })
    expect(hub.roomLive(1).presence).toBe(ROOM_PRESENCE.ONLINE)
  })

  it('is controllable only while online with its stream open', () => {
    const { hub, clock } = newHub()
    const stream = makeSink()

    const streamId = hub.openRoomStream(1, 10, stream)
    expect(hub.roomLive(1).controllable).toBe(false)

    hub.report(1, 10, idleReport)
    expect(hub.roomLive(1).controllable).toBe(true)

    clock.now += LIVE_OFFLINE_AFTER_MS
    expect(hub.roomLive(1).controllable).toBe(false)

    hub.report(1, 10, idleReport)
    hub.closeRoomStream(1, streamId)
    expect(hub.roomLive(1).controllable).toBe(false)
  })
})

describe('live hub broadcast', () => {
  it('sends room_status to the staff of the company on each report', () => {
    const { hub } = newHub()
    const staff = makeSink()

    hub.subscribeStaff(10, 1, staff)
    hub.report(1, 10, playingReport)

    expect(staff.events).toHaveLength(1)
    expect(staff.events[0]).toMatchObject({
      event: LIVE_EVENT.ROOM_STATUS,
      data: { roomId: 1, presence: ROOM_PRESENCE.IN_GAME, status: playingReport },
    })
  })

  it('sweep turns a silent room offline and tells the staff once', () => {
    const { hub, clock } = newHub()
    const staff = makeSink()

    hub.report(1, 10, idleReport)
    hub.subscribeStaff(10, 1, staff)

    hub.sweep()
    expect(staff.events).toEqual([])

    clock.now += LIVE_OFFLINE_AFTER_MS
    hub.sweep()
    hub.sweep()

    expect(staff.events).toHaveLength(1)
    expect((staff.events[0]?.data as RoomLive).presence).toBe(ROOM_PRESENCE.OFFLINE)
  })

  it('sweeps by itself every 15 seconds', () => {
    vi.useFakeTimers()

    const hub = createLiveHub()
    const staff = makeSink()

    hub.report(1, 10, idleReport)
    hub.subscribeStaff(10, 1, staff)

    vi.advanceTimersByTime(LIVE_OFFLINE_AFTER_MS + 15_000)

    expect(staff.events.map((message) => (message.data as RoomLive).presence)).toEqual([
      ROOM_PRESENCE.OFFLINE,
    ])

    hub.close()
  })

  it('never sends the events of a company to the staff of another one', () => {
    const { hub } = newHub()
    const staffA = makeSink()
    const staffB = makeSink()

    hub.subscribeStaff(10, 1, staffA)
    hub.subscribeStaff(20, 2, staffB)

    hub.report(1, 10, idleReport)
    expect(staffA.events).toHaveLength(1)
    expect(staffB.events).toHaveLength(0)

    hub.report(2, 20, playingReport)
    expect(staffA.events).toHaveLength(1)
    expect(staffB.events).toHaveLength(1)
    expect(staffB.events[0]?.data).toMatchObject({ roomId: 2 })
  })

  it('stops sending to a staff stream once it unsubscribed, and forgets it', () => {
    const { hub } = newHub()
    const staff = makeSink()

    const unsubscribe = hub.subscribeStaff(10, 7, staff)
    expect(hub.staffStreamCount(7)).toBe(1)

    unsubscribe()
    hub.report(1, 10, idleReport)

    expect(staff.events).toEqual([])
    expect(hub.staffStreamCount(7)).toBe(0)
  })

  it('counts the streams of one account across companies, not those of others', () => {
    const { hub } = newHub()

    hub.subscribeStaff(10, 7, makeSink())
    hub.subscribeStaff(10, 7, makeSink())
    hub.subscribeStaff(10, 8, makeSink())

    expect(hub.staffStreamCount(7)).toBe(2)
    expect(hub.staffStreamCount(8)).toBe(1)
  })
})

describe('live hub memory of offline rooms', () => {
  it('keeps the last report and the last seen date of a room that went offline', () => {
    const { hub, clock } = newHub()
    const staff = makeSink()
    const reportedAt = new Date(clock.now).toISOString()

    hub.report(1, 10, playingReport)
    hub.subscribeStaff(10, 1, staff)
    clock.now += LIVE_OFFLINE_AFTER_MS
    hub.sweep()

    expect(staff.events).toHaveLength(1)
    expect(hub.roomLive(1)).toEqual({
      roomId: 1,
      presence: ROOM_PRESENCE.OFFLINE,
      controllable: false,
      lastSeenAt: reportedAt,
      status: playingReport,
    })
  })

  it('keeps an offline room after its stream closed too', () => {
    const { hub, clock } = newHub()
    const reportedAt = new Date(clock.now).toISOString()
    const streamId = hub.openRoomStream(1, 10, makeSink())

    hub.report(1, 10, idleReport)
    clock.now += LIVE_OFFLINE_AFTER_MS
    hub.sweep()
    hub.closeRoomStream(1, streamId)

    expect(hub.roomLive(1)).toMatchObject({
      presence: ROOM_PRESENCE.OFFLINE,
      lastSeenAt: reportedAt,
      status: idleReport,
    })
  })

  it('keeps an online room whose stream closed, and its last seen date once offline', () => {
    const { hub, clock } = newHub()
    const reportedAt = new Date(clock.now).toISOString()
    const streamId = hub.openRoomStream(1, 10, makeSink())

    hub.report(1, 10, idleReport)
    hub.closeRoomStream(1, streamId)

    expect(hub.roomLive(1).presence).toBe(ROOM_PRESENCE.ONLINE)

    clock.now += LIVE_OFFLINE_AFTER_MS
    hub.sweep()

    expect(hub.roomLive(1)).toMatchObject({
      presence: ROOM_PRESENCE.OFFLINE,
      lastSeenAt: reportedAt,
    })
  })

  it('comes back online when an offline room reports again', () => {
    const { hub, clock } = newHub()

    hub.report(1, 10, idleReport)
    clock.now += LIVE_OFFLINE_AFTER_MS
    hub.sweep()
    hub.report(1, 10, playingReport)

    expect(hub.roomLive(1)).toMatchObject({
      presence: ROOM_PRESENCE.IN_GAME,
      status: playingReport,
    })
  })
})

describe('live hub room stream', () => {
  it('replaces the stream of a room: the old one gets replaced, then is closed', () => {
    const { hub } = newHub()
    const first = makeSink()
    const second = makeSink()

    const firstId = hub.openRoomStream(1, 10, first)
    const secondId = hub.openRoomStream(1, 10, second)

    expect(secondId).not.toBe(firstId)
    expect(first.events).toEqual([{ event: LIVE_EVENT.REPLACED, data: {} }])
    expect(first.state.closed).toBe(1)
    expect(second.events).toEqual([])
    expect(second.state.closed).toBe(0)
    expect(hub.isReplaced(1, firstId)).toBe(true)
    expect(hub.isReplaced(1, secondId)).toBe(false)
  })

  it('says a stream is replaced only while another stream is open for the room', () => {
    const { hub } = newHub()

    // Salle inconnue ou sans flux : personne n'a pris la place.
    expect(hub.isReplaced(1, 'any-id')).toBe(false)

    const streamId = hub.openRoomStream(1, 10, makeSink())
    expect(hub.isReplaced(1, 'any-id')).toBe(true)

    hub.closeRoomStream(1, streamId)
    expect(hub.isReplaced(1, streamId)).toBe(false)
    expect(hub.isReplaced(1, 'any-id')).toBe(false)
  })

  it('ignores the close of a stream that was already replaced', () => {
    const { hub } = newHub()

    const firstId = hub.openRoomStream(1, 10, makeSink())
    const secondId = hub.openRoomStream(1, 10, makeSink())
    hub.report(1, 10, idleReport)

    hub.closeRoomStream(1, firstId)

    expect(hub.isReplaced(1, secondId)).toBe(false)
    expect(hub.roomLive(1).controllable).toBe(true)
  })

  it('tells the staff when the stream of a room closes', () => {
    const { hub } = newHub()
    const staff = makeSink()

    const streamId = hub.openRoomStream(1, 10, makeSink())
    hub.report(1, 10, idleReport)
    hub.subscribeStaff(10, 1, staff)

    hub.closeRoomStream(1, streamId)

    expect(staff.events).toHaveLength(1)
    expect(staff.events[0]?.data).toMatchObject({ roomId: 1, controllable: false })
  })

  it('close() ends every stream and stops the sweep timer', () => {
    vi.useFakeTimers()

    const hub = createLiveHub()
    const room = makeSink()
    const staff = makeSink()

    expect(vi.getTimerCount()).toBe(1)

    hub.openRoomStream(1, 10, room)
    hub.subscribeStaff(10, 1, staff)
    hub.close()

    expect(room.state.closed).toBe(1)
    expect(staff.state.closed).toBe(1)
    expect(vi.getTimerCount()).toBe(0)
    expect(hub.staffStreamCount(1)).toBe(0)
  })
})

describe('live hub remote commands', () => {
  const COMPANY = 10
  const STAFF_ACCOUNT = 7

  // Salle 1 de la compagnie 10 : flux ouvert et rapport reçu, donc pilotable. Les minuteries sont
  // simulées pour traverser les 10 secondes sans attendre.
  function controllableRoom() {
    vi.useFakeTimers()

    const { hub } = newHub()
    const room = makeSink()
    const staff = makeSink()

    hub.openRoomStream(1, COMPANY, room)
    hub.report(1, COMPANY, playingReport)
    hub.subscribeStaff(COMPANY, STAFF_ACCOUNT, staff)
    staff.events.length = 0

    return { hub, room, staff }
  }

  const resultsOf = (sink: ReturnType<typeof makeSink>) =>
    sink.events.filter((message) => message.event === LIVE_EVENT.COMMAND_RESULT).map((m) => m.data)

  it('relays a command to the stream of the room, with its identifier', () => {
    const { hub, room } = controllableRoom()

    expect(hub.sendCommand(1, COMPANY, 'cmd-1', { command: 'pause' })).toBe('sent')
    expect(room.events).toEqual([
      { event: LIVE_EVENT.COMMAND, data: { commandId: 'cmd-1', command: 'pause' } },
    ])
  })

  it('relays the round and the question index of a skip', () => {
    const { hub, room } = controllableRoom()

    hub.sendCommand(1, COMPANY, 'cmd-1', { command: 'skip', round: 2, questionIndex: 3 })

    expect(room.events[0]?.data).toEqual({
      commandId: 'cmd-1',
      command: 'skip',
      round: 2,
      questionIndex: 3,
    })
  })

  it('tells the staff of the company that the room applied the command', () => {
    const { hub, staff } = controllableRoom()

    hub.sendCommand(1, COMPANY, 'cmd-1', { command: 'resume' })

    expect(hub.settleCommand(1, 'cmd-1', { result: ROOM_COMMAND_RESULT.APPLIED })).toBe(true)
    expect(resultsOf(staff)).toEqual([
      { commandId: 'cmd-1', roomId: 1, command: 'resume', result: 'applied' },
    ])
  })

  it('tells the staff why the room refused the command', () => {
    const { hub, staff } = controllableRoom()

    hub.sendCommand(1, COMPANY, 'cmd-1', { command: 'skip', round: 1, questionIndex: 0 })
    hub.settleCommand(1, 'cmd-1', {
      result: ROOM_COMMAND_RESULT.REFUSED,
      reason: GAME_COMMAND_REFUSAL.STALE_COMMAND,
    })

    expect(resultsOf(staff)).toEqual([
      {
        commandId: 'cmd-1',
        roomId: 1,
        command: 'skip',
        result: 'refused',
        reason: 'stale_command',
      },
    ])
  })

  it('accepts only one acknowledgement per command', () => {
    const { hub, staff } = controllableRoom()

    hub.sendCommand(1, COMPANY, 'cmd-1', { command: 'pause' })
    hub.settleCommand(1, 'cmd-1', { result: ROOM_COMMAND_RESULT.APPLIED })

    expect(
      hub.settleCommand(1, 'cmd-1', {
        result: ROOM_COMMAND_RESULT.REFUSED,
        reason: GAME_COMMAND_REFUSAL.GAME_OVER,
      })
    ).toBe(false)
    expect(resultsOf(staff)).toHaveLength(1)
  })

  it('answers expired to the staff after 10 seconds without acknowledgement, once', () => {
    const { hub, staff } = controllableRoom()

    hub.sendCommand(1, COMPANY, 'cmd-1', { command: 'abort' })

    vi.advanceTimersByTime(ROOM_COMMAND_TIMEOUT_MS - 1)
    expect(resultsOf(staff)).toEqual([])

    vi.advanceTimersByTime(1)
    vi.advanceTimersByTime(ROOM_COMMAND_TIMEOUT_MS)

    expect(resultsOf(staff)).toEqual([
      { commandId: 'cmd-1', roomId: 1, command: 'abort', result: 'expired' },
    ])
  })

  it('refuses a late acknowledgement: the command is unknown once expired', () => {
    const { hub, staff } = controllableRoom()

    hub.sendCommand(1, COMPANY, 'cmd-1', { command: 'pause' })
    vi.advanceTimersByTime(ROOM_COMMAND_TIMEOUT_MS)

    expect(hub.settleCommand(1, 'cmd-1', { result: ROOM_COMMAND_RESULT.APPLIED })).toBe(false)
    expect(resultsOf(staff)).toHaveLength(1)
  })

  it('does not say expired for a command that was acknowledged', () => {
    const { hub, staff } = controllableRoom()

    hub.sendCommand(1, COMPANY, 'cmd-1', { command: 'pause' })
    hub.settleCommand(1, 'cmd-1', { result: ROOM_COMMAND_RESULT.APPLIED })
    vi.advanceTimersByTime(ROOM_COMMAND_TIMEOUT_MS)

    expect(resultsOf(staff)).toEqual([expect.objectContaining({ result: 'applied' })])
  })

  it('relays an identifier only once, even after the acknowledgement', () => {
    const { hub, room } = controllableRoom()

    expect(hub.sendCommand(1, COMPANY, 'cmd-1', { command: 'pause' })).toBe('sent')
    expect(hub.sendCommand(1, COMPANY, 'cmd-1', { command: 'pause' })).toBe('duplicate')

    hub.settleCommand(1, 'cmd-1', { result: ROOM_COMMAND_RESULT.APPLIED })

    expect(hub.sendCommand(1, COMPANY, 'cmd-1', { command: 'pause' })).toBe('duplicate')
    expect(room.events).toHaveLength(1)
  })

  it('does not relay to a room that is not controllable', () => {
    vi.useFakeTimers()

    const { hub, clock } = newHub()
    const room = makeSink()

    // Aucun rapport ni flux : salle inconnue.
    expect(hub.sendCommand(1, COMPANY, 'cmd-1', { command: 'pause' })).toBe('not_controllable')

    // Flux ouvert, aucun rapport : hors ligne.
    const streamId = hub.openRoomStream(1, COMPANY, room)
    expect(hub.sendCommand(1, COMPANY, 'cmd-2', { command: 'pause' })).toBe('not_controllable')

    // Rapport trop ancien : hors ligne.
    hub.report(1, COMPANY, playingReport)
    clock.now += LIVE_OFFLINE_AFTER_MS
    expect(hub.sendCommand(1, COMPANY, 'cmd-3', { command: 'pause' })).toBe('not_controllable')

    // En ligne, mais flux fermé.
    hub.report(1, COMPANY, playingReport)
    hub.closeRoomStream(1, streamId)
    expect(hub.sendCommand(1, COMPANY, 'cmd-4', { command: 'pause' })).toBe('not_controllable')

    expect(room.events).toEqual([])
    expect(hub.pendingCommandCount()).toBe(0)
  })

  it('never relays a command of another company to the room', () => {
    const { hub, room } = controllableRoom()

    expect(hub.sendCommand(1, COMPANY + 1, 'cmd-1', { command: 'abort' })).toBe('not_controllable')
    expect(room.events).toEqual([])
  })

  it('gives the result to the staff of the company of the room only', () => {
    const { hub, staff } = controllableRoom()
    const otherStaff = makeSink()

    hub.subscribeStaff(COMPANY + 1, 99, otherStaff)
    hub.sendCommand(1, COMPANY, 'cmd-1', { command: 'pause' })
    hub.settleCommand(1, 'cmd-1', { result: ROOM_COMMAND_RESULT.APPLIED })
    hub.sendCommand(1, COMPANY, 'cmd-2', { command: 'pause' })
    vi.advanceTimersByTime(ROOM_COMMAND_TIMEOUT_MS)

    expect(resultsOf(staff)).toHaveLength(2)
    expect(otherStaff.events).toEqual([])
  })

  it('refuses the acknowledgement of another room, which leaves the command pending', () => {
    const { hub, staff } = controllableRoom()

    hub.openRoomStream(2, COMPANY, makeSink())
    hub.report(2, COMPANY, playingReport)
    staff.events.length = 0
    hub.sendCommand(1, COMPANY, 'cmd-1', { command: 'pause' })

    expect(hub.settleCommand(2, 'cmd-1', { result: ROOM_COMMAND_RESULT.APPLIED })).toBe(false)
    expect(resultsOf(staff)).toEqual([])
    expect(hub.settleCommand(1, 'cmd-1', { result: ROOM_COMMAND_RESULT.APPLIED })).toBe(true)
  })

  it('refuses the acknowledgement of a command nobody sent', () => {
    const { hub } = controllableRoom()

    expect(hub.settleCommand(1, 'never-sent', { result: ROOM_COMMAND_RESULT.APPLIED })).toBe(false)
  })

  it('forgets every command after the delay, acknowledged or not, and accepts the identifier again', () => {
    const { hub, room } = controllableRoom()

    hub.sendCommand(1, COMPANY, 'cmd-1', { command: 'pause' })
    hub.sendCommand(1, COMPANY, 'cmd-2', { command: 'resume' })
    hub.settleCommand(1, 'cmd-2', { result: ROOM_COMMAND_RESULT.APPLIED })
    expect(hub.pendingCommandCount()).toBe(2)

    vi.advanceTimersByTime(ROOM_COMMAND_TIMEOUT_MS)

    expect(hub.pendingCommandCount()).toBe(0)
    // Il ne reste que la minuterie de balayage du hub.
    expect(vi.getTimerCount()).toBe(1)
    expect(hub.sendCommand(1, COMPANY, 'cmd-1', { command: 'pause' })).toBe('sent')
    expect(room.events).toHaveLength(3)
  })

  it('caps the commands kept per room, and frees the room once they are purged', () => {
    const { hub } = controllableRoom()

    hub.openRoomStream(2, COMPANY, makeSink())
    hub.report(2, COMPANY, playingReport)

    for (let index = 0; index < COMMAND_MAX_PER_ROOM; index += 1) {
      expect(hub.sendCommand(1, COMPANY, `cmd-${index}`, { command: 'pause' })).toBe('sent')
    }

    expect(hub.sendCommand(1, COMPANY, 'one-too-many', { command: 'pause' })).toBe('too_many')
    expect(hub.sendCommand(2, COMPANY, 'other-room', { command: 'pause' })).toBe('sent')
    expect(hub.pendingCommandCount()).toBe(COMMAND_MAX_PER_ROOM + 1)

    vi.advanceTimersByTime(ROOM_COMMAND_TIMEOUT_MS)

    expect(hub.pendingCommandCount()).toBe(0)
    expect(hub.sendCommand(1, COMPANY, 'one-too-many', { command: 'pause' })).toBe('sent')
  })

  it('close() drops the pending commands and their timers', () => {
    const { hub, staff } = controllableRoom()

    hub.sendCommand(1, COMPANY, 'cmd-1', { command: 'pause' })
    hub.close()
    vi.advanceTimersByTime(ROOM_COMMAND_TIMEOUT_MS)

    expect(hub.pendingCommandCount()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(staff.events).toEqual([])
  })
})
