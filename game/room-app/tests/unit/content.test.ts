import { QUESTION_MEDIA_TYPE_AUDIO, QUESTION_MEDIA_TYPE_IMAGE } from '@quizzup/shared'

import { collectMediaUrls } from '@/game/content'

describe('collectMediaUrls', () => {
  it('ne précharge que les extraits audio, pas les images', () => {
    const question = { id: 1, text: 'Q', mediaStartMs: 0, answers: [] }
    const urls = collectMediaUrls([
      {
        id: 1,
        name: 'Mixte',
        questions: [
          {
            ...question,
            mediaType: QUESTION_MEDIA_TYPE_AUDIO,
            mediaUrl: 'https://media.test/1.mp3',
          },
          {
            ...question,
            id: 2,
            mediaType: QUESTION_MEDIA_TYPE_IMAGE,
            mediaUrl: 'https://img/2.png',
          },
        ],
      },
    ])

    expect(urls).toEqual(['https://media.test/1.mp3'])
  })

  it('garde telle quelle l’URL absolue d’un extrait tiers, une seule fois', () => {
    const deezer = 'https://cdnt-preview.dzcdn.net/api/1/1/a/12.mp3?hdnea=exp=1~hmac=abc'
    const question = {
      id: 1,
      text: 'Q',
      mediaStartMs: 0,
      mediaType: QUESTION_MEDIA_TYPE_AUDIO,
      mediaUrl: deezer,
      answers: [],
    }

    expect(
      collectMediaUrls([{ id: 1, name: 'T', questions: [question, { ...question, id: 2 }] }])
    ).toEqual([deezer])
  })
})
