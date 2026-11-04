import type { GameSetup } from '@quizzup/game-engine'

import { getDemoThemes } from '@/game/demoContent'
import type { Registration } from '@/game/registrations'
import { toEngineParticipants } from '@/game/registrations'

export const REGISTRATIONS: Registration[] = [
  { desk: 1, displayName: 'Léa', email: '', consent: false, consentAt: null },
  {
    desk: 2,
    displayName: 'Hugo',
    email: 'hugo@exemple.fr',
    consent: true,
    consentAt: '2026-11-03T20:00:00.000Z',
  },
  { desk: 3, displayName: 'Inès', email: '', consent: false, consentAt: null },
]

export function baseSetup(overrides: Partial<GameSetup> = {}): GameSetup {
  return {
    seed: 42,
    participants: toEngineParticipants(REGISTRATIONS),
    themes: getDemoThemes(),
    roundsCount: 2,
    questionsPerRound: 2,
    ...overrides,
  }
}

/** Horloge manuelle pour piloter le temps du moteur dans les tests. */
export function createManualClock(start = 1000) {
  const clock = {
    value: start,
    now: () => clock.value,
    advance: (ms: number) => {
      clock.value += ms
    },
  }
  return clock
}

/** Thèmes de démo avec de « vraies » URL d'extraits (la démo `demo://` reste muette). */
export function getPlayableThemes() {
  return getDemoThemes().map((theme) => ({
    ...theme,
    questions: theme.questions.map((question) => ({
      ...question,
      mediaUrl: question.mediaUrl?.replace('demo://', 'https://media.test/') ?? null,
    })),
  }))
}
