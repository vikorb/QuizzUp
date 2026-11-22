import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  LIVE_EVENT,
  LIVE_OFFLINE_AFTER_MS,
  ROOM_PRESENCE,
  type RoomLive,
  type RoomStatusReport,
} from '@quizzup/shared'
import { createLiveHub, type LiveHub } from '@backend/live/hub'

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

    for (const phase of ['lobby', 'finished', 'aborted']) {
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
