import { browserClock, createDefaultKeymap, createKeyboardBuzzerInput } from '@quizzup/hardware'

import { createMemorySessionStorage, GameSession } from '@/game/session'

import { driveToQuestion } from '../_helpers/drive'
import { baseSetup, createManualClock, REGISTRATIONS } from '../_helpers/fixtures'

/**
 * Buzzers clavier + vrai moteur : un appui daté T (`event.timeStamp`) dont le handler tourne à
 * T + 100 ms. Le palier attribué dépend de l'instant que le moteur applique à l'appui.
 */
type BlindState = {
  stageIndex: number
  stageStartedAt: number
  answeringParticipantId: number | null
}

const HANDLER_DELAY_MS = 100
const HUGO_KEY = 'KeyQ' // pupitre 2, bouton A (Hugo, participant 2)

function setup() {
  const clock = createManualClock()
  const session = GameSession.create(baseSetup(), REGISTRATIONS, {
    storage: createMemorySessionStorage(),
    now: clock.now,
  })
  session.start()
  driveToQuestion(session, clock)
  const input = createKeyboardBuzzerInput({
    keymap: createDefaultKeymap(),
    // Seul `now` sert aux buzzers clavier ; les minuteurs ne sont pas utilisés.
    clock: { ...browserClock, now: clock.now },
  })
  input.onPress((press) => session.press(press.desk, press.buttonIndex, press.at))

  const blind = (): BlindState => {
    const { phase } = session.state
    if (phase.name !== 'question') {
      throw new Error(`not in question: ${phase.name}`)
    }
    return phase.miniGameState as unknown as BlindState
  }
  /** Touche physiquement enfoncée à `timeStamp`, traitée par le handler `delay` ms plus tard. */
  const pressLate = (code: string, timeStamp: number, delay: number) => {
    clock.value = timeStamp + delay
    const event = new KeyboardEvent('keydown', { code, cancelable: true })
    Object.defineProperty(event, 'timeStamp', { value: timeStamp })
    window.dispatchEvent(event)
  }
  return { clock, session, input, blind, pressLate }
}

describe('buzzers clavier et ordre des appuis dans le moteur', () => {
  let current: ReturnType<typeof setup> | null = null
  afterEach(() => {
    current?.input.dispose()
    current = null
  })

  it('un appui daté T reçu à T + 100 ms obtient le palier de T quand aucun tick ne passe entre', () => {
    current = setup()
    const { blind, pressLate } = current
    // Dernière milliseconde du palier 1 (1 s d'extrait + 3 s de fenêtre de buzz).
    const t = blind().stageStartedAt + 3_990
    expect(blind().stageIndex).toBe(0)

    pressLate(HUGO_KEY, t, HANDLER_DELAY_MS)

    // Sans l'horodatage de l'événement, l'appui serait daté T + 100 : palier 2.
    expect(blind().stageIndex).toBe(0)
    expect(blind().answeringParticipantId).toBe(2)
  })

  it('limite actuelle : un tick intercalé ramène l’appui antérieur sur le dernier instant connu', () => {
    current = setup()
    const { blind, clock, pressLate, session } = current
    const t = blind().stageStartedAt + 3_990

    // Le tick de la salle passe avant le handler clavier : le palier 1 expire, le 2 démarre.
    clock.value = t + 50
    session.tick()
    expect(blind().stageIndex).toBe(1)

    pressLate(HUGO_KEY, t, HANDLER_DELAY_MS)

    // `reduceGame` applique `max(at, lastAt)` : l'appui perd son avance et tombe au palier 2.
    expect(blind().stageIndex).toBe(1)
    expect(blind().answeringParticipantId).toBe(2)
  })
})
