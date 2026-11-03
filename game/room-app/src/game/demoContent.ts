import type { EngineQuestion, EngineTheme } from '@quizzup/game-engine'
import { QUESTION_MEDIA_TYPE_AUDIO } from '@quizzup/shared'

/**
 * Contenu de démonstration (mode démo, sans backoffice) : des thèmes « sans
 * tubes » (bruitages, instruments…), conformes à la piste retenue pour les droits
 * musicaux. Les URL `demo://` sont jouées par le lecteur silencieux.
 */
type DemoTheme = { id: number; name: string; items: string[] }

const DEMO_THEMES: DemoTheme[] = [
  {
    id: 9001,
    name: 'Instruments',
    items: ['Piano', 'Violon', 'Guitare', 'Batterie', 'Trompette', 'Flûte', 'Harpe', 'Saxophone'],
  },
  {
    id: 9002,
    name: 'Bruits du quotidien',
    items: [
      'Machine à café',
      'Aspirateur',
      'Porte qui grince',
      'Sonnette',
      'Micro-ondes',
      'Clavier',
      'Douche',
      'Réveil',
    ],
  },
  {
    id: 9003,
    name: 'Animaux',
    items: ['Chat', 'Chien', 'Coq', 'Vache', 'Loup', 'Éléphant', 'Grenouille', 'Hibou'],
  },
  {
    id: 9004,
    name: 'Transports',
    items: ['Train', 'Moto', 'Hélicoptère', 'Vélo', 'Avion', 'Tramway', 'Bateau', 'Camion'],
  },
  {
    id: 9005,
    name: 'Sports',
    items: ['Tennis', 'Basket', 'Boxe', 'Ping-pong', 'Golf', 'Natation', 'Escrime', 'Bowling'],
  },
  {
    id: 9006,
    name: 'Météo et nature',
    items: ['Orage', 'Pluie', 'Vent', 'Vagues', 'Grêle', 'Cascade', 'Feu de bois', 'Neige'],
  },
]

const QUESTIONS_PER_THEME = 10

function buildQuestion(theme: DemoTheme, index: number): EngineQuestion {
  const id = theme.id * 100 + index
  const count = theme.items.length
  // 4 propositions consécutives (en boucle) ; la première est la bonne, le moteur mélange.
  const options = [0, 1, 2, 3].map((offset) => theme.items[(index + offset) % count] ?? '')

  return {
    id,
    text: `${theme.name} — extrait ${index + 1}`,
    mediaType: QUESTION_MEDIA_TYPE_AUDIO,
    mediaUrl: `demo://${theme.id}/${index + 1}`,
    mediaStartMs: 0,
    answers: options.map((text, position) => ({
      id: id * 10 + position,
      text,
      isCorrect: position === 0,
    })),
  }
}

export function getDemoThemes(): EngineTheme[] {
  return DEMO_THEMES.map((theme) => ({
    id: theme.id,
    name: theme.name,
    questions: Array.from({ length: QUESTIONS_PER_THEME }, (_item, index) =>
      buildQuestion(theme, index)
    ),
  }))
}
