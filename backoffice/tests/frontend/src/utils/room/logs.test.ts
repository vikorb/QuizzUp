import { createRoomLogFixture } from '@frontend-tests/_helpers/roomsServiceMock'
import {
  ROOM_LOG_LEVEL_ERROR,
  ROOM_LOG_LEVEL_WARN,
  ROOM_LOG_LEVELS,
  ROOM_LOG_LIST_DEFAULT_LIMIT,
  ROOM_LOG_MESSAGE_MAX_LENGTH,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import {
  getRoomLogContextEntries,
  getRoomLogLevelFilterOptions,
  getRoomLogTone,
  hasMoreRoomLogs,
  parseRoomLogLevelFilter,
  truncateRoomLogMessage,
} from '@/utils/room/logs'

function page(size: number) {
  return Array.from({ length: size }, (_item, index) => createRoomLogFixture({ id: index + 1 }))
}

describe('utils/room/logs.ts', () => {
  it('offers "all" then every shared level as filter options', () => {
    const options = getRoomLogLevelFilterOptions((key) => key)

    expect(options.map((option) => option.value)).toEqual(['all', ...ROOM_LOG_LEVELS])
    expect(options[1]?.label).toBe(`rooms.logs.levels.${ROOM_LOG_LEVELS[0]}`)
  })

  it('parses a level and falls back to "all" for anything else', () => {
    expect(parseRoomLogLevelFilter(ROOM_LOG_LEVEL_WARN)).toBe(ROOM_LOG_LEVEL_WARN)
    expect(parseRoomLogLevelFilter('debug')).toBe('all')
    expect(parseRoomLogLevelFilter('')).toBe('all')
  })

  it('uses the danger tone for errors and the warn tone for warnings', () => {
    expect(getRoomLogTone(ROOM_LOG_LEVEL_ERROR)).toBe('danger')
    expect(getRoomLogTone(ROOM_LOG_LEVEL_WARN)).toBe('warn')
  })

  it('keeps a short message and cuts a long one with an ellipsis', () => {
    expect(truncateRoomLogMessage('court')).toBe('court')

    const exact = 'a'.repeat(ROOM_LOG_MESSAGE_MAX_LENGTH)

    expect(truncateRoomLogMessage(exact)).toBe(exact)

    const cut = truncateRoomLogMessage('a'.repeat(ROOM_LOG_MESSAGE_MAX_LENGTH + 50))

    expect(cut).toHaveLength(ROOM_LOG_MESSAGE_MAX_LENGTH)
    expect(cut.endsWith('…')).toBe(true)
  })

  it('lists the context in the whitelist order and ignores unknown keys', () => {
    const context = { httpStatus: 503, route: '/game', secret: 'x' } as never

    expect(getRoomLogContextEntries(context)).toEqual([
      { key: 'route', value: '/game' },
      { key: 'httpStatus', value: '503' },
    ])
    expect(getRoomLogContextEntries(null)).toEqual([])
  })

  it('detects a full page as "there may be more"', () => {
    expect(hasMoreRoomLogs(page(ROOM_LOG_LIST_DEFAULT_LIMIT))).toBe(true)
    expect(hasMoreRoomLogs(page(ROOM_LOG_LIST_DEFAULT_LIMIT - 1))).toBe(false)
    expect(hasMoreRoomLogs([])).toBe(false)
  })
})
