import { describe, expect, it } from 'vitest'

import {
  GAME_PODIUMS,
  getRoomDesksCount,
  ROOM_DEFAULT_DESKS,
  ROOM_MIN_DESKS,
} from '@quizzup/shared'

describe("@quizzup/shared — pupitres d'une salle", () => {
  it('caps the podiums at 6 and gives a new room 4', () => {
    expect(GAME_PODIUMS).toBe(6)
    expect(ROOM_DEFAULT_DESKS).toBe(4)
    expect(ROOM_MIN_DESKS).toBe(1)
  })

  it('reads rooms.config.desksCount', () => {
    for (const count of [1, 2, 3, 4, 5, 6]) {
      expect(getRoomDesksCount({ desksCount: count })).toBe(count)
    }
  })

  it('falls back to 4 for an absent, old or invalid config', () => {
    for (const config of [
      undefined,
      null,
      {},
      [],
      'texte',
      42,
      { buzzers: { keymap: {} } },
      { desksCount: '5' },
      { desksCount: null },
      { desksCount: Number.NaN },
      { desksCount: Number.POSITIVE_INFINITY },
    ]) {
      expect(getRoomDesksCount(config)).toBe(ROOM_DEFAULT_DESKS)
    }
  })

  it('brings out-of-range and decimal values back into 1..6', () => {
    expect(getRoomDesksCount({ desksCount: 0 })).toBe(1)
    expect(getRoomDesksCount({ desksCount: -3 })).toBe(1)
    expect(getRoomDesksCount({ desksCount: 7 })).toBe(6)
    expect(getRoomDesksCount({ desksCount: 100 })).toBe(6)
    expect(getRoomDesksCount({ desksCount: 2.9 })).toBe(2)
  })
})
