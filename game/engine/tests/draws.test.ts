import {
  drawOfferedThemes,
  drawRoundChooser,
  drawRoundQuestions,
  getLeaderIds,
} from '@engine/draws'
import { createRandom } from '@engine/random'
import {
  ROUND_CHOOSER_REASON_FALLBACK_RANDOM,
  ROUND_CHOOSER_REASON_FIRST_ROUND_RANDOM,
  ROUND_CHOOSER_REASON_RANDOM_EXCLUDING_LEADER,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import { audioQuestion, audioTheme } from './_helpers/fixtures'

const scores = (values: number[]) =>
  values.map((score, index) => ({ participantId: index + 1, score }))

describe('getLeaderIds', () => {
  it('returns every participant tied for first place', () => {
    expect(getLeaderIds(scores([10, 30, 30, 0]))).toEqual([2, 3])
    expect(getLeaderIds([])).toEqual([])
  })
})

describe('drawRoundChooser', () => {
  it('draws among everyone on the first round', () => {
    const draw = drawRoundChooser(scores([0, 0, 0, 0]), 1, createRandom(1))

    expect(draw?.reason).toBe(ROUND_CHOOSER_REASON_FIRST_ROUND_RANDOM)
    expect([1, 2, 3, 4]).toContain(draw?.participantId)
  })

  it('never picks a leader after the first round', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const draw = drawRoundChooser(scores([50, 100, 20, 100]), 3, createRandom(seed))

      expect(draw?.reason).toBe(ROUND_CHOOSER_REASON_RANDOM_EXCLUDING_LEADER)
      expect([1, 3]).toContain(draw?.participantId)
    }
  })

  it('falls back to everyone when all participants are tied', () => {
    const draw = drawRoundChooser(scores([20, 20]), 2, createRandom(5))

    expect(draw?.reason).toBe(ROUND_CHOOSER_REASON_FALLBACK_RANDOM)
    expect([1, 2]).toContain(draw?.participantId)
  })

  it('returns null without participants', () => {
    expect(drawRoundChooser([], 1, createRandom(1))).toBeNull()
    expect(drawRoundChooser([], 2, createRandom(1))).toBeNull()
  })
})

describe('drawOfferedThemes', () => {
  const themes = [1, 2, 3, 4, 5, 6].map((id) => audioTheme(id, 1))

  it('prefers themes not played yet', () => {
    const offered = drawOfferedThemes(themes, [1, 2], 4, createRandom(3))

    expect(offered.map((theme) => theme.id).toSorted()).toEqual([3, 4, 5, 6])
  })

  it('offers already played themes again when every theme was played', () => {
    const offered = drawOfferedThemes(themes.slice(0, 2), [1, 2], 4, createRandom(3))

    expect(offered.map((theme) => theme.id).toSorted()).toEqual([1, 2])
  })
})

describe('drawRoundQuestions', () => {
  const questions = [1, 2, 3, 4].map((id) => audioQuestion(id))

  it('draws unplayed questions first, then completes with played ones', () => {
    const drawn = drawRoundQuestions(questions, [1, 2], 3, createRandom(8))
    const ids = drawn.map((question) => question.id)

    expect(ids).toHaveLength(3)
    expect(ids.slice(0, 2).toSorted()).toEqual([3, 4])
    expect([1, 2]).toContain(ids[2])
  })

  it('returns fewer questions when the theme is too small', () => {
    expect(drawRoundQuestions(questions, [], 10, createRandom(8))).toHaveLength(4)
  })
})
