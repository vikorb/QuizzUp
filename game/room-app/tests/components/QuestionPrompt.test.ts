import { QUESTION_MEDIA_TYPE_AUDIO } from '@quizzup/shared'

import QuestionPrompt from '@/components/game/QuestionPrompt.vue'
import { setCurrentLocale } from '@/plugins/i18n'

import { mountWithApp } from '../_helpers/mount'

function questionOf(id: number) {
  return {
    id,
    text: 'Quel est ce titre ?',
    mediaType: QUESTION_MEDIA_TYPE_AUDIO,
    mediaUrl: null,
    mediaStartMs: 0,
    answers: [],
  }
}

describe('QuestionPrompt : question d’un titre de playlist', () => {
  afterEach(() => setCurrentLocale('fr'))

  it('affiche le texte du serveur pour une question classique', async () => {
    const { wrapper } = await mountWithApp(QuestionPrompt, {
      props: { question: { ...questionOf(7), text: 'Capitale de la France ?' } },
    })

    expect(wrapper.find('.prompt__text').text()).toBe('Capitale de la France ?')
  })

  it('traduit la question d’un titre de playlist (identifiant négatif) en français', async () => {
    const { wrapper } = await mountWithApp(QuestionPrompt, { props: { question: questionOf(-31) } })

    expect(wrapper.find('.prompt__text').text()).toBe('Quel est ce titre ?')
  })

  it('traduit la question d’un titre de playlist en anglais', async () => {
    const { wrapper } = await mountWithApp(QuestionPrompt, { props: { question: questionOf(-31) } })
    setCurrentLocale('en')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.prompt__text').text()).toBe('What is this track?')
  })
})
