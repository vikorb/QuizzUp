import { afterEach, describe, expect, it, vi } from 'vitest'

import { ROOM_LOG_DEFAULT_RETENTION_DAYS, ROOM_LOG_MAX_PER_ROOM } from '@quizzup/shared'
import { getRoomLogRetentionDays, pruneRoomLogs } from '@backend/routes/room/_logs'

afterEach(() => {
  delete process.env.ROOM_LOG_RETENTION_DAYS
})

describe('getRoomLogRetentionDays', () => {
  it.each([
    [undefined, ROOM_LOG_DEFAULT_RETENTION_DAYS],
    ['', ROOM_LOG_DEFAULT_RETENTION_DAYS],
    ['  ', ROOM_LOG_DEFAULT_RETENTION_DAYS],
    ['abc', ROOM_LOG_DEFAULT_RETENTION_DAYS],
    ['0', ROOM_LOG_DEFAULT_RETENTION_DAYS],
    ['-5', ROOM_LOG_DEFAULT_RETENTION_DAYS],
    ['1.5', ROOM_LOG_DEFAULT_RETENTION_DAYS],
    ['1', 1],
    [' 7 ', 7],
    ['90', 90],
  ])('%j -> %i days', (value, expected) => {
    expect(getRoomLogRetentionDays(value)).toBe(expected)
  })

  it('reads ROOM_LOG_RETENTION_DAYS by default', () => {
    process.env.ROOM_LOG_RETENTION_DAYS = '14'

    expect(getRoomLogRetentionDays()).toBe(14)
  })
})

describe('pruneRoomLogs', () => {
  it('deletes by room, with the retention and the per-room cap as bindings', async () => {
    const raw = vi.fn().mockResolvedValue(undefined)
    process.env.ROOM_LOG_RETENTION_DAYS = '10'

    await pruneRoomLogs({ raw } as never, 42)

    expect(raw).toHaveBeenCalledTimes(1)
    expect(raw.mock.calls[0]![0]).toContain('DELETE FROM room_logs')
    expect(raw.mock.calls[0]![1]).toEqual([42, 10, 42, ROOM_LOG_MAX_PER_ROOM])
  })
})
