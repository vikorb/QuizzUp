import { WebAudioExtractPlayer } from '@quizzup/audio'
import type { ButtonIndex, EngineTheme } from '@quizzup/game-engine'
import { QUESTION_MEDIA_TYPE_AUDIO } from '@quizzup/shared'
import { createAudioBridge } from '@room-app/audio/audioBridge'

import { answerButtons, createGameDriver } from './gameDriver'
import { installSoundMonitor } from './soundMonitor'

/**
 * Banc audio : vrai moteur + vrai pont audio de l'écran de salle + vrai lecteur Web Audio,
 * avec un extrait libre de droits (synthétisé par le test). Le moniteur mesure ce qui
 * sort réellement vers les haut-parleurs.
 */
export const EXTRACT_URL = '/media/extrait-libre.wav'
/** L'extrait est muet avant 2 s : si le point de départ était ignoré, le palier 1 serait muet. */
export const EXTRACT_START_MS = 2000

const monitor = installSoundMonitor()
const player = new WebAudioExtractPlayer()
const bridge = createAudioBridge(player)

const THEME: EngineTheme = {
  id: 1,
  name: 'Synthés libres',
  questions: [
    {
      id: 11,
      text: 'Quel instrument ?',
      mediaType: QUESTION_MEDIA_TYPE_AUDIO,
      mediaUrl: EXTRACT_URL,
      mediaStartMs: EXTRACT_START_MS,
      answers: [
        { id: 111, text: 'Orgue', isCorrect: true },
        { id: 112, text: 'Harpe', isCorrect: false },
        { id: 113, text: 'Tuba', isCorrect: false },
        { id: 114, text: 'Banjo', isCorrect: false },
      ],
    },
  ],
}

const driver = createGameDriver({
  participants: [
    { id: 1, podium: 1, displayName: 'Alice' },
    { id: 2, podium: 2, displayName: 'Bob' },
  ],
  themes: [THEME],
  roundsCount: 1,
  questionsPerRound: 1,
  timings: { roundIntroMs: 200, themeChoiceMs: 200, revealMs: 500, roundSummaryMs: 200 },
  onEvents: (events) => bridge.handleEvents(events),
})

let preload: { loaded: string[]; failed: string[] } | null = null

document.querySelector('#unlock')?.addEventListener('click', () => {
  // Comme « Lancer la salle » : déblocage du son dans le geste, puis préchargement.
  void player
    .unlock()
    .then(() => player.preload([EXTRACT_URL]))
    .then((result) => {
      preload = result
    })
})


const harness = {
  preload: () => preload,
  contextState: () => player.getContext()?.state ?? null,
  start: () => driver.start(),
  press: (podium: number, button: ButtonIndex) => driver.press(podium, button),
  answerButtons: () => answerButtons(driver.state()),
  phase: () => driver.state().phase.name,
  events: () => driver.events(),
  segments: () => monitor.segments(),
  isAudible: () => monitor.isAudible(),
  now: () => performance.now(),
}

declare global {
  interface Window {
    audioHarness: typeof harness
  }
}

window.audioHarness = harness
