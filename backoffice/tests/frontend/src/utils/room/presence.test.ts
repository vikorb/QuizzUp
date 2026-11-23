import { createRoomLive } from '@frontend-tests/_helpers/liveMock'
import { ROOM_PRESENCE } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import { formatSeenAgo, getRoomPresenceKind, getRoomPresenceLabelKey } from '@/utils/room/presence'

const SEEN = '2026-11-23T10:00:00.000Z'
const at = (offsetSeconds: number): number => Date.parse(SEEN) + offsetSeconds * 1000

describe('utils/room/presence', () => {
  it('maps the server presence to a kind', () => {
    const kindOf = (presence: (typeof ROOM_PRESENCE)[keyof typeof ROOM_PRESENCE]) =>
      getRoomPresenceKind(createRoomLive({ presence }), false)

    expect(kindOf(ROOM_PRESENCE.ONLINE)).toBe('online')
    expect(kindOf(ROOM_PRESENCE.OFFLINE)).toBe('offline')
    expect(kindOf(ROOM_PRESENCE.IN_GAME)).toBe('in_game')
  })

  it('is unknown when the stream is not trustworthy or the room is missing', () => {
    expect(getRoomPresenceKind(createRoomLive(), true)).toBe('unknown')
    expect(getRoomPresenceKind(null, false)).toBe('unknown')
  })

  it('builds the label key from the kind', () => {
    expect(getRoomPresenceLabelKey('in_game')).toBe('live.presence.in_game')
  })

  it('writes the elapsed time in the requested language', () => {
    expect(formatSeenAgo(SEEN, at(5 * 60), 'fr')).toBe('il y a 5 minutes')
    expect(formatSeenAgo(SEEN, at(5 * 60), 'en')).toBe('5 minutes ago')
    expect(formatSeenAgo(SEEN, at(50), 'en')).toBe('50 seconds ago')
    expect(formatSeenAgo(SEEN, at(3 * 3600 + 10), 'en')).toBe('3 hours ago')
    expect(formatSeenAgo(SEEN, at(2 * 86400 + 10), 'en')).toBe('2 days ago')
  })

  it('never writes a time in the future when the clocks differ', () => {
    expect(formatSeenAgo(SEEN, at(-30), 'en')).toBe('now')
  })

  it('returns null for an unreadable date', () => {
    expect(formatSeenAgo('pas une date', at(0), 'fr')).toBeNull()
  })
})
