import { mount } from '@vue/test-utils'

import TimerBar from '@/components/game/TimerBar.vue'
import type { BlindTestView } from '@/game/selectors'
import { createAppI18n } from '@/plugins/i18n'
import BlindTestScreen from '@/views/game/BlindTestScreen.vue'

function view(overrides: Partial<BlindTestView>): BlindTestView {
  return {
    question: {
      id: 1,
      text: 'Quel titre ?',
      mediaType: 'audio',
      mediaUrl: null,
      mediaStartMs: 0,
      answers: [
        { id: 1, text: 'A', isCorrect: true },
        { id: 2, text: 'B', isCorrect: false },
      ],
    },
    questionIndex: 0,
    questionsCount: 3,
    stage: 1,
    status: 'listening',
    stageProgress: 0.5,
    stageRemainingMs: 2500,
    answeringParticipantId: null,
    answerRemainingMs: 0,
    lockedOutIds: [],
    ...overrides,
  }
}

function mountScreen(overrides: Partial<BlindTestView>) {
  return mount(BlindTestScreen, {
    props: { view: view(overrides), answering: undefined },
    global: { plugins: [createAppI18n()] },
  })
}

describe('BlindTestScreen : barres de temps', () => {
  it('la barre du palier est silencieuse (la musique joue) mais passe en warn sous 3 s', () => {
    const bar = mountScreen({ status: 'listening' }).findComponent(TimerBar)

    expect(bar.props('silent')).toBe(true)
    expect(bar.classes()).toContain('timer--warn')
  })

  it('la barre de la réponse garde son tick', () => {
    const bar = mountScreen({
      status: 'answering',
      answeringParticipantId: 1,
      answerRemainingMs: 4000,
    }).findComponent(TimerBar)

    expect(bar.props('silent')).toBe(false)
  })
})
