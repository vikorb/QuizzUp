import { mount } from '@vue/test-utils'

import TimerBar from '@/components/game/TimerBar.vue'
import type { BlindTestView } from '@/game/selectors'
import { createMemorySessionStorage } from '@/game/session'
import { closeGame, configureRoomGame } from '@/game/useRoomGame'
import { createAppI18n } from '@/plugins/i18n'
import BlindTestScreen from '@/views/game/BlindTestScreen.vue'

import { createManualClock } from '../_helpers/fixtures'

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

const answeringView = (answerRemainingMs: number) =>
  view({ status: 'answering', answeringParticipantId: 1, answerRemainingMs })

function mountScreen(overrides: Partial<BlindTestView>) {
  return mount(BlindTestScreen, {
    props: { view: view(overrides), answering: undefined },
    global: { plugins: [createAppI18n()] },
  })
}

describe('BlindTestScreen : barres de temps', () => {
  const play = vi.fn()

  beforeEach(() => {
    play.mockClear()
    configureRoomGame({
      sounds: { play },
      storage: createMemorySessionStorage(),
      now: createManualClock().now,
    })
  })

  afterEach(() => closeGame())

  it('la barre du palier passe en warn sous 3 s et ne joue aucun tick (la musique joue)', async () => {
    const wrapper = mountScreen({ status: 'listening', stageRemainingMs: 3600 })

    for (let ms = 3550; ms >= 0; ms -= 50) {
      await wrapper.setProps({ view: view({ status: 'listening', stageRemainingMs: ms }) })
    }

    expect(wrapper.findComponent(TimerBar).classes()).toContain('timer--warn')
    expect(play).not.toHaveBeenCalled()
  })

  it('la barre de la réponse est muette aussi : pas de tick qui couvre la mesure du silence', async () => {
    const wrapper = mountScreen({
      status: 'answering',
      answeringParticipantId: 1,
      answerRemainingMs: 4000,
    })

    for (let ms = 3950; ms >= 0; ms -= 50) {
      await wrapper.setProps({ view: answeringView(ms) })
    }

    expect(wrapper.findComponent(TimerBar).classes()).toContain('timer--warn')
    expect(play).not.toHaveBeenCalled()
  })
})
