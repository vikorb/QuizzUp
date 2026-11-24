import { describe, expect, it } from 'vitest'

import {
  QUESTION_AUDIO_EFFECT_NONE,
  QUESTION_KIND_QCM,
  QUESTION_MEDIA_TYPE_AUDIO,
} from '@quizzup/shared'
import { buildPlaylistQuestions } from '@backend/routes/room/_playlists'
import type { ProviderPlaylistTrack } from '@backend/services/mediaProvider'

function track(id: number, overrides: Partial<ProviderPlaylistTrack> = {}): ProviderPlaylistTrack {
  return {
    provider: 'deezer',
    ref: String(id),
    title: `Titre ${id}`,
    titleShort: `Titre ${id}`,
    artist: `Artiste ${id}`,
    album: `Album ${id}`,
    coverUrl: `https://cdn.test/cover/${id}.jpg`,
    previewUrl: `https://cdn.test/preview/${id}.mp3`,
    link: `https://www.deezer.com/track/${id}`,
    readable: true,
    ...overrides,
  }
}

const tracks = (count: number, first = 1) =>
  Array.from({ length: count }, (_value, index) => track(first + index))

/** Titre d'une réponse (avant « – »), minuscules, sans accents ni espaces superflus. */
const normalized = (text: string) =>
  text
    .split(' – ')[0]
    .normalize('NFD')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll(/\s+/g, ' ')
    .trim()

/** Générateur à graine fixe (LCG) : le même tirage à chaque exécution. */
function seeded(seed: number) {
  let state = seed

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296

    return state / 4_294_967_296
  }
}

describe('buildPlaylistQuestions', () => {
  it('builds the question of the conception: negative ids, preview, credit and four answers', () => {
    const [question] = buildPlaylistQuestions(tracks(8), 1, seeded(1))
    const ref = -question.id

    expect(question).toMatchObject({
      text: 'Quel est ce titre ?',
      kind: QUESTION_KIND_QCM,
      mediaType: QUESTION_MEDIA_TYPE_AUDIO,
      mediaUrl: `https://cdn.test/preview/${ref}.mp3`,
      mediaStartMs: 0,
      audioEffect: QUESTION_AUDIO_EFFECT_NONE,
      mediaCredit: {
        provider: 'deezer',
        title: `Titre ${ref}`,
        artist: `Artiste ${ref}`,
        coverUrl: `https://cdn.test/cover/${ref}.jpg`,
        link: `https://www.deezer.com/track/${ref}`,
      },
    })
    expect(ref).toBeGreaterThan(0)
    expect(question.answers).toHaveLength(4)
    expect(question.answers.every((answer) => answer.id < 0)).toBe(true)
    expect(new Set(question.answers.map((answer) => answer.id)).size).toBe(4)

    const correct = question.answers.filter((answer) => answer.isCorrect)

    expect(correct).toEqual([
      { id: question.id, text: `Titre ${ref} – Artiste ${ref}`, isCorrect: true },
    ])
  })

  it('draws the same questions for the same random, and uses the random it is given', () => {
    const list = tracks(20)
    const first = buildPlaylistQuestions(list, 5, seeded(7))

    expect(buildPlaylistQuestions(list, 5, seeded(7))).toEqual(first)
    expect(buildPlaylistQuestions(list, 5, seeded(8))).not.toEqual(first)
    // Sans mélange (j = i à chaque pas), le premier titre est tiré ; avec j = 0, c'est le deuxième.
    expect(buildPlaylistQuestions(tracks(4), 1, () => 0.99)[0].id).toBe(-1)
    expect(buildPlaylistQuestions(tracks(4), 1, () => 0)[0].id).toBe(-2)
  })

  it('draws `count` distinct titles when the playlist has enough', () => {
    const questions = buildPlaylistQuestions(tracks(30), 10, seeded(3))

    expect(questions).toHaveLength(10)
    expect(new Set(questions.map((question) => question.id)).size).toBe(10)
  })

  it('makes a shorter round when fewer playable titles than asked', () => {
    const questions = buildPlaylistQuestions(tracks(6), 10, seeded(3))

    expect(questions).toHaveLength(6)
    expect(new Set(questions.map((question) => question.id)).size).toBe(6)
  })

  it('never asks a title without a preview or not readable, but may use it as a decoy', () => {
    const list = [
      track(1),
      track(2),
      track(3, { previewUrl: null }),
      track(4, { readable: false }),
      track(5, { previewUrl: null }),
      track(6, { readable: false }),
    ]
    const asked = new Set<number>()
    const decoys = new Set<number>()

    for (let seed = 1; seed <= 40; seed += 1) {
      for (const question of buildPlaylistQuestions(list, 10, seeded(seed))) {
        asked.add(-question.id)

        for (const answer of question.answers) {
          decoys.add(-answer.id)
        }
      }
    }

    expect([...asked].sort()).toEqual([1, 2])
    expect([...decoys].sort()).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('removes duplicate titles on the normalized short title', () => {
    const list = [
      track(1, { titleShort: 'Été' }),
      track(2, { titleShort: '  ete ' }),
      track(3, { titleShort: 'ÉTÉ' }),
      track(4, { titleShort: 'Ete  indien' }),
      track(5, { titleShort: 'ete indien' }),
      track(6, { titleShort: 'Autre' }),
    ]

    for (let seed = 1; seed <= 20; seed += 1) {
      const questions = buildPlaylistQuestions(list, 10, seeded(seed))

      expect(questions).toHaveLength(3)

      for (const question of questions) {
        // Les réponses d'une question ont toutes un titre différent.
        expect(new Set(question.answers.map((answer) => normalized(answer.text))).size).toBe(
          question.answers.length
        )
      }
    }
  })

  it('gives as many answers as distinct titles when the playlist has two or three', () => {
    expect(buildPlaylistQuestions(tracks(2), 5, seeded(1)).map((q) => q.answers.length)).toEqual([
      2, 2,
    ])
    expect(buildPlaylistQuestions(tracks(3), 5, seeded(1)).map((q) => q.answers.length)).toEqual([
      3, 3, 3,
    ])
  })

  it('draws nothing from fewer than two playable titles', () => {
    expect(buildPlaylistQuestions([], 5, seeded(1))).toEqual([])
    expect(buildPlaylistQuestions(tracks(1), 5, seeded(1))).toEqual([])
    expect(
      buildPlaylistQuestions([track(1), track(2, { previewUrl: null }), track(3)], 5, seeded(1))
        .length
    ).toBe(2)
    expect(
      buildPlaylistQuestions(
        [track(1), track(2, { previewUrl: null }), track(3, { readable: false })],
        5,
        seeded(1)
      )
    ).toEqual([])
    expect(
      buildPlaylistQuestions([track(1), track(2, { titleShort: 'titre 1' })], 5, seeded(1))
    ).toEqual([])
  })
})
