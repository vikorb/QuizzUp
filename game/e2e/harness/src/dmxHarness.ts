import type { ButtonIndex, EngineParticipant, EngineTheme } from '@quizzup/game-engine'
import {
  createDefaultKeymap,
  createKeyboardBuzzerInput,
  createLightingController,
  createSimulationOutput,
  defaultRoomHardwareConfig,
  type Desk,
} from '@quizzup/hardware'
import { QUESTION_MEDIA_TYPE_AUDIO } from '@quizzup/shared'

import { createGameDriver } from './gameDriver'

/**
 * Banc lumières : vrai moteur + vrais buzzers clavier + vrai contrôleur de lumières de
 * `@quizzup/hardware`, sur la sortie DMX simulée. Une salle type : un PAR RGB par pupitre
 * (adresses 1, 4, 7, 10) et une machine à fumée DMX (adresse 20).
 */
const PARTICIPANTS: EngineParticipant[] = [
  { id: 1, podium: 1, displayName: 'Alice' },
  { id: 2, podium: 2, displayName: 'Bob' },
]

const THEME: EngineTheme = {
  id: 1,
  name: 'Bruitages libres',
  questions: [1, 2].map((index) => ({
    id: 10 + index,
    text: `Bruitage ${index}`,
    mediaType: QUESTION_MEDIA_TYPE_AUDIO,
    mediaUrl: `demo://bruitage/${index}`,
    mediaStartMs: 0,
    answers: ['Pluie', 'Train', 'Chat', 'Cloche'].map((text, position) => ({
      id: (10 + index) * 10 + position,
      text,
      isCorrect: position === 0,
    })),
  })),
}

const config = defaultRoomHardwareConfig().lighting
config.fixtures = [
  ...([1, 2, 3, 4] as Desk[]).map((desk) => ({
    id: `par-${desk}`,
    name: `PAR pupitre ${desk}`,
    profileId: 'par-rgb',
    address: 1 + (desk - 1) * 3,
    desk,
  })),
  { id: 'smoke', name: 'Machine à fumée', profileId: 'smoke-dmx', address: 20 },
]

const output = createSimulationOutput()
/** Niveau maximal jamais envoyé à la machine à fumée (canal 20). */
const SMOKE_INDEX = 19
let smokeMax = 0
output.onFrame((frame) => {
  smokeMax = Math.max(smokeMax, frame[SMOKE_INDEX] ?? 0)
})
const lights = createLightingController({
  config,
  output,
  resolveDesk: (participantId) =>
    (PARTICIPANTS.find((participant) => participant.id === participantId)?.podium as Desk) ?? null,
})

const driver = createGameDriver({
  participants: PARTICIPANTS,
  themes: [THEME],
  roundsCount: 1,
  questionsPerRound: 2,
  timings: { roundIntroMs: 300, themeChoiceMs: 300, revealMs: 1500, roundSummaryMs: 500 },
  onEvents: (events) => {
    for (const event of events) {
      lights.handleGameEvent(event)
    }
  },
})

// Buzzers lus au clavier (clavier de simulation par défaut : 1-4, Q-R, A-F, Z-V).
const buzzers = createKeyboardBuzzerInput({ keymap: createDefaultKeymap() })
buzzers.onPress((press) => driver.press(press.desk, press.buttonIndex as ButtonIndex, press.at))

let started = false
document.querySelector('#start')?.addEventListener('click', () => {
  void lights.start().then(() => {
    started = true
  })
})

/** Couleur (R, G, B) envoyée au PAR d'un pupitre dans la dernière trame DMX. */
function parColor(desk: Desk): [number, number, number] {
  const frame = output.lastFrame()
  // Univers de 512 canaux : le canal DMX n est à l'index n - 1.
  const base = (desk - 1) * 3
  return [frame[base] ?? 0, frame[base + 1] ?? 0, frame[base + 2] ?? 0]
}

const harness = {
  started: () => started,
  startGame: () => driver.start(),
  phase: () => driver.state().phase.name,
  events: () => driver.events(),
  scene: () => lights.getState().currentSceneId,
  lightingState: () => {
    const { running, simulation, emergency, outputStatus } = lights.getState()
    return { running, simulation, emergency, outputStatus }
  },
  framesSent: () => output.framesSent(),
  parColor,
  frameMax: () => Math.max(...output.lastFrame()),
  smokeMax: () => smokeMax,
  fixtures: () => lights.getFixtureViews(),
  emergencyStop: () => lights.emergencyStop('test e2e'),
  resetEmergency: () => lights.resetEmergency(),
  correctButton: (): ButtonIndex => {
    const { phase } = driver.state()
    const answers = phase.name === 'question' ? phase.miniGameState.question.answers : []
    return Math.max(
      0,
      answers.findIndex((answer) => answer.isCorrect)
    ) as ButtonIndex
  },
}

declare global {
  interface Window {
    dmxHarness: typeof harness
  }
}

window.dmxHarness = harness
