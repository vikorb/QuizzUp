import { createRandom, drawMany, pickOne } from '@engine/random'
import { describe, expect, it } from 'vitest'

describe('random', () => {
  it('produces the same sequence for the same seed', () => {
    const first = createRandom(123)
    const second = createRandom(123)

    expect(Array.from({ length: 5 }, () => first.next())).toEqual(
      Array.from({ length: 5 }, () => second.next())
    )
  })

  it('produces values in [0, 1) and differs between seeds', () => {
    const random = createRandom(1)
    const values = Array.from({ length: 1000 }, () => random.next())

    expect(values.every((value) => value >= 0 && value < 1)).toBe(true)
    expect(createRandom(2).next()).not.toBe(createRandom(1).next())
  })

  it('resumes the sequence from its saved state', () => {
    const random = createRandom(7)
    random.next()
    const resumed = createRandom(random.state())

    expect(resumed.next()).toBe(random.next())
  })

  it('picks nothing from an empty list', () => {
    expect(pickOne([], createRandom(1))).toBeUndefined()
  })

  it('draws distinct items, capped to the list size', () => {
    const drawn = drawMany([1, 2, 3, 4, 5], 3, createRandom(9))

    expect(drawn).toHaveLength(3)
    expect(new Set(drawn).size).toBe(3)
    expect(drawMany([1, 2], 5, createRandom(9)).toSorted()).toEqual([1, 2])
    expect(drawMany([1, 2], -1, createRandom(9))).toEqual([])
  })

  it('does not mutate the source list', () => {
    const source = [1, 2, 3]
    drawMany(source, 3, createRandom(3))

    expect(source).toEqual([1, 2, 3])
  })
})
