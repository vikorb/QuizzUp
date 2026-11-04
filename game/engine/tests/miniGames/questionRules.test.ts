import {
  cappedLoss,
  getParticipantIds,
  getScore,
  hasPlayableAnswers,
  isEstimateQuestion,
  isMultipleChoiceQuestion,
  isRangeAnswer,
  isTrueAnswer,
  isTrueFalseQuestion,
  normalizeText,
  parseLeadingNumber,
} from '@engine/miniGames/questionRules'
import {
  QUESTION_KIND_ESTIMATE,
  QUESTION_KIND_QCM,
  QUESTION_KIND_TRUE_FALSE,
  QUESTION_MEDIA_TYPE_AUDIO,
  QUESTION_MEDIA_TYPE_IMAGE,
  QUESTION_MEDIA_TYPE_VIDEO,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import {
  audioQuestion,
  estimateQuestion,
  imageQuestion,
  PARTICIPANTS,
  qcmQuestion,
  trueFalseQuestion,
} from '../_helpers/fixtures'

describe('normalizeText', () => {
  it('lowercases, strips accents and surrounding spaces', () => {
    expect(normalizeText('  VRAI ')).toBe('vrai')
    expect(normalizeText('Électricité')).toBe('electricite')
    expect(normalizeText('Faux')).toBe('faux')
  })
})

describe('isTrueAnswer', () => {
  it('recognises « vrai » and « true » whatever the case', () => {
    expect(isTrueAnswer({ id: 1, text: 'Vrai', isCorrect: true })).toBe(true)
    expect(isTrueAnswer({ id: 1, text: ' TRUE ', isCorrect: false })).toBe(true)
    expect(isTrueAnswer({ id: 1, text: 'Faux', isCorrect: true })).toBe(false)
    expect(isTrueAnswer({ id: 1, text: 'Vraiment', isCorrect: true })).toBe(false)
  })
})

describe('hasPlayableAnswers', () => {
  it('requires between min and max answers and a correct one', () => {
    expect(hasPlayableAnswers(qcmQuestion(1))).toBe(true)
    expect(hasPlayableAnswers(qcmQuestion(1, 0, 2))).toBe(true)
    expect(hasPlayableAnswers(qcmQuestion(1, 0, 1))).toBe(false)
    expect(hasPlayableAnswers(qcmQuestion(1, 0, 5))).toBe(false)
    expect(hasPlayableAnswers(qcmQuestion(1, 9))).toBe(false)
    expect(hasPlayableAnswers(qcmQuestion(1, 0, 2), 3, 4)).toBe(false)
  })
})

describe('isMultipleChoiceQuestion', () => {
  it('accepts text questions with 2 to 4 answers, images stay for the progressive reveal', () => {
    expect(isMultipleChoiceQuestion(qcmQuestion(1))).toBe(true)
    expect(isMultipleChoiceQuestion(imageQuestion(1))).toBe(false)
    expect(isMultipleChoiceQuestion(qcmQuestion(1, 1, 2))).toBe(true)
  })

  it('rejects audio, video and invalid answers', () => {
    expect(isMultipleChoiceQuestion(audioQuestion(1))).toBe(false)
    expect(
      isMultipleChoiceQuestion({ ...qcmQuestion(1), mediaType: QUESTION_MEDIA_TYPE_VIDEO })
    ).toBe(false)
    expect(isMultipleChoiceQuestion(qcmQuestion(1, 0, 1))).toBe(false)
    expect(isMultipleChoiceQuestion(qcmQuestion(1, 0, 5))).toBe(false)
    expect(isMultipleChoiceQuestion(qcmQuestion(1, 9))).toBe(false)
  })
})

describe('isTrueFalseQuestion', () => {
  it('accepts exactly « Vrai » / « Faux » with one correct answer, in any order or case', () => {
    expect(isTrueFalseQuestion(trueFalseQuestion(1, true))).toBe(true)
    expect(isTrueFalseQuestion(trueFalseQuestion(1, false))).toBe(true)
    expect(
      isTrueFalseQuestion({
        ...qcmQuestion(1),
        answers: [
          { id: 1, text: 'TRUE', isCorrect: false },
          { id: 2, text: 'false', isCorrect: true },
        ],
      })
    ).toBe(true)
    expect(
      isTrueFalseQuestion({
        ...trueFalseQuestion(1, true),
        mediaUrl: 'x',
        mediaType: QUESTION_MEDIA_TYPE_IMAGE,
      })
    ).toBe(false)
  })

  it('rejects other answers, counts, media or correctness', () => {
    const base = trueFalseQuestion(1, true)

    expect(isTrueFalseQuestion(qcmQuestion(1, 0, 2))).toBe(false)
    expect(isTrueFalseQuestion(qcmQuestion(1))).toBe(false)
    expect(
      isTrueFalseQuestion({
        ...base,
        answers: [
          { id: 1, text: 'Vrai', isCorrect: true },
          { id: 2, text: 'Vrai', isCorrect: false },
        ],
      })
    ).toBe(false)
    expect(
      isTrueFalseQuestion({
        ...base,
        answers: base.answers.map((answer) => ({ ...answer, isCorrect: true })),
      })
    ).toBe(false)
    expect(
      isTrueFalseQuestion({
        ...base,
        answers: base.answers.map((answer) => ({ ...answer, isCorrect: false })),
      })
    ).toBe(false)
    expect(
      isTrueFalseQuestion({
        ...base,
        answers: [...base.answers, { id: 3, text: 'Peut-être', isCorrect: false }],
      })
    ).toBe(false)
    expect(isTrueFalseQuestion({ ...base, mediaType: QUESTION_MEDIA_TYPE_AUDIO })).toBe(false)
  })
})

describe('parseLeadingNumber', () => {
  it('reads the first number, with thousands separators and decimal commas', () => {
    expect(parseLeadingNumber('Entre 1 000 et 2 000')).toBe(1000)
    expect(parseLeadingNumber('1,5 m')).toBe(1.5)
    expect(parseLeadingNumber('2.75')).toBe(2.75)
    expect(parseLeadingNumber('Moins de 100')).toBe(100)
    expect(parseLeadingNumber('-40 °C')).toBe(-40)
    expect(parseLeadingNumber('1 234 567')).toBe(1_234_567)
  })

  it('returns null without number', () => {
    expect(parseLeadingNumber('Beaucoup')).toBeNull()
    expect(parseLeadingNumber('')).toBeNull()
  })
})

describe('isEstimateQuestion', () => {
  it('accepts 3 or 4 numeric ranges with a single correct one', () => {
    const question = estimateQuestion(1)

    expect(isEstimateQuestion(question)).toBe(true)
    expect(isEstimateQuestion({ ...question, answers: question.answers.slice(1) })).toBe(true)
  })

  it('rejects non numeric answers, wrong counts, several correct answers or audio', () => {
    const question = estimateQuestion(1)

    expect(
      isEstimateQuestion({
        ...question,
        answers: question.answers.map((answer, index) =>
          index === 0 ? { ...answer, text: 'Beaucoup' } : answer
        ),
      })
    ).toBe(false)
    expect(isEstimateQuestion({ ...question, answers: question.answers.slice(2) })).toBe(false)
    expect(
      isEstimateQuestion({
        ...question,
        answers: question.answers.map((answer) => ({ ...answer, isCorrect: true })),
      })
    ).toBe(false)
    expect(
      isEstimateQuestion({
        ...question,
        answers: question.answers.map((answer) => ({ ...answer, isCorrect: false })),
      })
    ).toBe(false)
    expect(isEstimateQuestion({ ...question, mediaType: QUESTION_MEDIA_TYPE_AUDIO })).toBe(false)
  })
})

describe('getScore / getParticipantIds / cappedLoss', () => {
  it('reads a score, 0 for unknown participants', () => {
    const scores = [
      { participantId: 1, score: 120 },
      { participantId: 2, score: 0 },
    ]

    expect(getScore(scores, 1)).toBe(120)
    expect(getScore(scores, 2)).toBe(0)
    expect(getScore(scores, 9)).toBe(0)
  })

  it('lists participant ids in order', () => {
    expect(getParticipantIds(PARTICIPANTS)).toEqual([1, 2, 3, 4])
  })

  it('never takes more than the available score', () => {
    expect(cappedLoss(50, 200)).toBe(-50)
    expect(cappedLoss(50, 30)).toBe(-30)
    expect(cappedLoss(50, 0)).toBe(0)
    expect(cappedLoss(50, -10)).toBe(0)
  })
})

const answer = (text: string) => ({ id: 1, text, isCorrect: false })

describe('isRangeAnswer', () => {
  it('accepts numeric ranges and rejects QCM answers that merely contain a number', () => {
    for (const text of [
      '100 à 199',
      'Moins de 50',
      'Entre 10 et 20',
      '< 5',
      '1 000 ou plus',
      'Avant 1800',
      'Après 1900',
    ]) {
      expect(isRangeAnswer(answer(text))).toBe(true)
    }
    for (const text of ['Henri 4', 'Louis 14', 'Réponse 0']) {
      expect(isRangeAnswer(answer(text))).toBe(false)
    }
  })
})

const numbers = (texts: string[], correct = 0) =>
  texts.map((text, index) => ({ id: index + 1, text, isCorrect: index === correct }))

describe('question kind from the backoffice', () => {
  it('keeps plain numbers as a QCM unless the question is typed as an estimate', () => {
    const question = { ...qcmQuestion(1), answers: numbers(['6', '4', '7', '12']) }

    expect(isEstimateQuestion(question)).toBe(false)
    expect(isEstimateQuestion({ ...question, kind: QUESTION_KIND_ESTIMATE })).toBe(true)
    expect(isMultipleChoiceQuestion(question)).toBe(true)
  })

  it('reads ranges with « avant » / « après » or two linked numbers without a kind', () => {
    const before = {
      ...qcmQuestion(1),
      answers: numbers(['Avant 1800', '1800 à 1849', '1850 à 1899', 'Après 1900'], 1),
    }
    const dashes = { ...qcmQuestion(2), answers: numbers(['1-9', '10-19', '20-29']) }

    expect(isEstimateQuestion(before)).toBe(true)
    expect(isEstimateQuestion(dashes)).toBe(true)
  })

  it('deduces the kind behind the default « qcm » (old content), trusts the other kinds', () => {
    // « qcm » est la valeur par défaut en base, l'ancien contenu l'a aussi.
    expect(isEstimateQuestion({ ...estimateQuestion(1), kind: QUESTION_KIND_QCM })).toBe(true)
    expect(isTrueFalseQuestion({ ...trueFalseQuestion(1, true), kind: QUESTION_KIND_QCM })).toBe(
      true
    )
    expect(
      isTrueFalseQuestion({ ...trueFalseQuestion(1, true), kind: QUESTION_KIND_TRUE_FALSE })
    ).toBe(true)
    expect(
      isTrueFalseQuestion({ ...trueFalseQuestion(1, true), kind: QUESTION_KIND_ESTIMATE })
    ).toBe(false)
    expect(isEstimateQuestion({ ...estimateQuestion(1), kind: QUESTION_KIND_TRUE_FALSE })).toBe(
      false
    )
  })

  it('keeps scores, « environ » lists and plain numbers as QCM without the estimate kind', () => {
    for (const texts of [
      ['3-0', '2-1', '1-0', '2-0'],
      ['Environ 5', 'Environ 10', 'Environ 15', 'Environ 20'],
      ['~5', '~10', '~15'],
    ]) {
      expect(isEstimateQuestion({ ...qcmQuestion(1), answers: numbers(texts) })).toBe(false)
    }
  })

  it('reads « ou avant », « et plus » and increasing linked numbers as ranges', () => {
    for (const texts of [
      ['1800 ou avant', '1850', '1900', '1950'],
      ['10', '20', '50 et plus'],
      ['1 000 à 1 999', '2 000', '3 000'],
    ]) {
      expect(isEstimateQuestion({ ...qcmQuestion(1), answers: numbers(texts) })).toBe(true)
    }
  })

  it('rejects image questions whatever their kind', () => {
    expect(
      isTrueFalseQuestion({
        ...trueFalseQuestion(1, true),
        kind: QUESTION_KIND_TRUE_FALSE,
        mediaType: QUESTION_MEDIA_TYPE_IMAGE,
        mediaUrl: 'x',
      })
    ).toBe(false)
    expect(
      isEstimateQuestion({
        ...estimateQuestion(1),
        kind: QUESTION_KIND_ESTIMATE,
        mediaType: QUESTION_MEDIA_TYPE_IMAGE,
        mediaUrl: 'x',
      })
    ).toBe(false)
  })

  it('still needs numbers to sort an estimate typed as such', () => {
    expect(
      isEstimateQuestion({
        ...qcmQuestion(1),
        kind: QUESTION_KIND_ESTIMATE,
        answers: numbers(['Peu', 'Beaucoup', 'Énormément']),
      })
    ).toBe(false)
  })
})
