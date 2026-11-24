import { describe, expect, it } from 'vitest'

import {
  estimateGameDurationMs,
  GAME_DEFAULT_FORMAT,
  GAME_DEFAULT_QUESTIONS_PER_ROUND,
  GAME_DEFAULT_ROUNDS,
  GAME_DEFAULT_TIMINGS_MS,
  GAME_FORMAT_CUSTOM,
  GAME_FORMAT_DISCOVERY,
  GAME_FORMAT_SETTINGS,
  GAME_FORMAT_SHORT,
  GAME_FORMAT_STANDARD,
  GAME_FORMATS,
  GAME_MAX_QUESTIONS_PER_ROUND,
  GAME_MAX_ROUNDS,
  MINI_GAME_QUESTION_ESTIMATES_MS,
  MINI_GAME_TRUE_FALSE,
  MINI_GAMES,
  type MiniGame,
  THEME_CHOICE_TYPICAL_MS,
} from '@quizzup/shared'

const minutes = (ms: number): number => ms / 60_000

describe('@quizzup/shared — formats de partie', () => {
  it('liste les quatre formats, Standard par défaut', () => {
    expect(GAME_FORMATS).toEqual(['discovery', 'short', 'standard', 'custom'])
    expect(GAME_DEFAULT_FORMAT).toBe(GAME_FORMAT_STANDARD)
  })

  it('fixe les manches et les questions des formats à nombres fixes', () => {
    expect(GAME_FORMAT_SETTINGS).toEqual({
      discovery: { roundsCount: 3, questionsPerRound: 3 },
      short: { roundsCount: 6, questionsPerRound: 7 },
      standard: { roundsCount: 10, questionsPerRound: 10 },
    })
  })

  it('garde Standard aligné sur le défaut du moteur et du serveur', () => {
    expect(GAME_FORMAT_SETTINGS[GAME_FORMAT_STANDARD]).toEqual({
      roundsCount: GAME_DEFAULT_ROUNDS,
      questionsPerRound: GAME_DEFAULT_QUESTIONS_PER_ROUND,
    })
  })

  it('n’a pas de nombres pour Personnalisé et reste dans les bornes autorisées', () => {
    expect(GAME_FORMAT_CUSTOM in GAME_FORMAT_SETTINGS).toBe(false)
    for (const settings of Object.values(GAME_FORMAT_SETTINGS)) {
      expect(settings.roundsCount).toBeGreaterThanOrEqual(1)
      expect(settings.roundsCount).toBeLessThanOrEqual(GAME_MAX_ROUNDS)
      expect(settings.questionsPerRound).toBeGreaterThanOrEqual(1)
      expect(settings.questionsPerRound).toBeLessThanOrEqual(GAME_MAX_QUESTIONS_PER_ROUND)
    }
  })
})

describe('@quizzup/shared — estimations par mini-jeu', () => {
  it('a une ligne par mini-jeu, avec un typique inférieur ou égal au haut', () => {
    expect([...Object.keys(MINI_GAME_QUESTION_ESTIMATES_MS)].sort()).toEqual([...MINI_GAMES].sort())
    for (const { typicalMs, highMs } of Object.values(MINI_GAME_QUESTION_ESTIMATES_MS)) {
      expect(typicalMs).toBeGreaterThan(0)
      expect(typicalMs).toBeLessThanOrEqual(highMs)
    }
  })
})

describe('@quizzup/shared — estimateGameDurationMs', () => {
  it.each([
    // [format, jeu typique min, jeu haut min] : table de la conception, jeu haut arrondi au-dessus (comme le lobby).
    [GAME_FORMAT_DISCOVERY, 3, 6],
    [GAME_FORMAT_SHORT, 12, 21],
    [GAME_FORMAT_STANDARD, 28, 47],
  ] as const)('%s : %i min typique, %i min haut (tous les mini-jeux)', (format, typical, high) => {
    const estimate = estimateGameDurationMs(GAME_FORMAT_SETTINGS[format])

    expect(Math.round(minutes(estimate.typicalMs))).toBe(typical)
    expect(Math.ceil(minutes(estimate.highMs))).toBe(high)
  })

  it('Standard tient dans un créneau de 60 minutes, Courte dans un créneau de 30 minutes', () => {
    expect(
      minutes(estimateGameDurationMs(GAME_FORMAT_SETTINGS[GAME_FORMAT_STANDARD]).highMs)
    ).toBeLessThanOrEqual(60)
    expect(
      minutes(estimateGameDurationMs(GAME_FORMAT_SETTINGS[GAME_FORMAT_SHORT]).highMs)
    ).toBeLessThanOrEqual(30)
  })

  it('calcule R × (intro + thème + bilan) + R × Q × moyenne pour un format personnalisé', () => {
    const { roundIntroMs, themeChoiceMs, roundSummaryMs } = GAME_DEFAULT_TIMINGS_MS
    const trueFalse = MINI_GAME_QUESTION_ESTIMATES_MS[MINI_GAME_TRUE_FALSE]

    const estimate = estimateGameDurationMs({
      roundsCount: 2,
      questionsPerRound: 5,
      miniGames: [MINI_GAME_TRUE_FALSE],
    })

    // Choix du thème typique : `THEME_CHOICE_TYPICAL_MS` ; au plus : `themeChoiceMs`.
    expect(estimate.typicalMs).toBe(
      2 * (roundIntroMs + THEME_CHOICE_TYPICAL_MS + roundSummaryMs) + 10 * trueFalse.typicalMs
    )
    expect(estimate.highMs).toBe(
      2 * (roundIntroMs + themeChoiceMs + roundSummaryMs) + 10 * trueFalse.highMs
    )
  })

  it('fait la moyenne des mini-jeux cochés seulement', () => {
    const [first, second] = MINI_GAMES
    const both = estimateGameDurationMs({
      roundsCount: 1,
      questionsPerRound: 10,
      miniGames: [first!, second!],
    })
    const onlyFirst = estimateGameDurationMs({
      roundsCount: 1,
      questionsPerRound: 10,
      miniGames: [first!],
    })
    const onlySecond = estimateGameDurationMs({
      roundsCount: 1,
      questionsPerRound: 10,
      miniGames: [second!],
    })

    expect(both.highMs).toBe(Math.round((onlyFirst.highMs + onlySecond.highMs) / 2))
  })

  it('compte tous les mini-jeux quand la liste est absente ou vide', () => {
    const all = estimateGameDurationMs({
      roundsCount: 4,
      questionsPerRound: 4,
      miniGames: MINI_GAMES,
    })

    expect(estimateGameDurationMs({ roundsCount: 4, questionsPerRound: 4 })).toEqual(all)
    expect(estimateGameDurationMs({ roundsCount: 4, questionsPerRound: 4, miniGames: [] })).toEqual(
      all
    )
  })

  it('ignore les codes de mini-jeu inconnus, et les compte tous s’il n’en reste aucun', () => {
    const input = { roundsCount: 4, questionsPerRound: 4 }
    const known = estimateGameDurationMs({ ...input, miniGames: [MINI_GAME_TRUE_FALSE] })

    expect(
      estimateGameDurationMs({
        ...input,
        miniGames: [MINI_GAME_TRUE_FALSE, 'inconnu' as MiniGame],
      })
    ).toEqual(known)
    expect(estimateGameDurationMs({ ...input, miniGames: ['inconnu' as MiniGame] })).toEqual(
      estimateGameDurationMs(input)
    )
  })

  it('donne la plus petite partie : 1 manche, 1 question', () => {
    const { roundIntroMs, themeChoiceMs, roundSummaryMs } = GAME_DEFAULT_TIMINGS_MS
    const estimate = estimateGameDurationMs({
      roundsCount: 1,
      questionsPerRound: 1,
      miniGames: [MINI_GAME_TRUE_FALSE],
    })

    expect(estimate.typicalMs).toBe(roundIntroMs + THEME_CHOICE_TYPICAL_MS + roundSummaryMs + 6100)
    expect(estimate.highMs).toBe(roundIntroMs + themeChoiceMs + roundSummaryMs + 8500)
  })

  it('donne la plus grande partie (20 × 20), plus longue que Standard', () => {
    const largest = estimateGameDurationMs({
      roundsCount: GAME_MAX_ROUNDS,
      questionsPerRound: GAME_MAX_QUESTIONS_PER_ROUND,
    })
    const standard = estimateGameDurationMs(GAME_FORMAT_SETTINGS[GAME_FORMAT_STANDARD])

    expect(largest.typicalMs).toBeGreaterThan(standard.typicalMs)
    expect(largest.highMs).toBeGreaterThan(standard.highMs)
    expect(largest.typicalMs).toBeLessThanOrEqual(largest.highMs)
  })

  it('croît avec les manches et avec les questions', () => {
    const base = estimateGameDurationMs({ roundsCount: 3, questionsPerRound: 3 })

    expect(estimateGameDurationMs({ roundsCount: 4, questionsPerRound: 3 }).highMs).toBeGreaterThan(
      base.highMs
    )
    expect(estimateGameDurationMs({ roundsCount: 3, questionsPerRound: 4 }).highMs).toBeGreaterThan(
      base.highMs
    )
  })

  it.each([0, -3, Number.NaN, Number.POSITIVE_INFINITY])(
    'rend zéro pour %s manche(s) : pas de partie',
    (rounds) => {
      expect(estimateGameDurationMs({ roundsCount: rounds, questionsPerRound: 5 })).toEqual({
        typicalMs: 0,
        highMs: 0,
      })
    }
  )

  it.each([0, -3, Number.NaN])(
    'ne compte que l’annonce, le thème et le bilan pour %s question(s) par manche',
    (questions) => {
      const { roundIntroMs, themeChoiceMs, roundSummaryMs } = GAME_DEFAULT_TIMINGS_MS

      expect(estimateGameDurationMs({ roundsCount: 2, questionsPerRound: questions })).toEqual({
        typicalMs: 2 * (roundIntroMs + THEME_CHOICE_TYPICAL_MS + roundSummaryMs),
        highMs: 2 * (roundIntroMs + themeChoiceMs + roundSummaryMs),
      })
    }
  )

  it('ignore la partie décimale des nombres', () => {
    expect(estimateGameDurationMs({ roundsCount: 3.9, questionsPerRound: 3.9 })).toEqual(
      estimateGameDurationMs({ roundsCount: 3, questionsPerRound: 3 })
    )
  })
})
