import type { Desk, Rgb, Rgbw } from '../types'

/**
 * Cible d'une étape :
 * - `all` : tous les appareils lumière ;
 * - `desk` : appareils dédiés au pupitre concerné par l'événement + lyres qui ont une position
 *   enregistrée pour ce pupitre ;
 * - `others` : tous les autres appareils lumière ;
 * - liste d'identifiants d'appareils.
 */
export type SceneTarget = 'all' | 'desk' | 'others' | string[]

/** Couleur fixe, ou `desk` : la couleur du pupitre concerné. */
export type SceneColor = Rgbw | 'desk'

/** Orientation des lyres : vers le pupitre concerné, ou position de repos. */
export type SceneAim = 'desk' | 'home'

export type SceneStep =
  | {
      type: 'color'
      target?: SceneTarget
      color: SceneColor
      /** Intensité 0-1 (1 par défaut). */
      intensity?: number
      fadeMs?: number
      holdMs?: number
      aim?: SceneAim
    }
  | {
      type: 'flash'
      target?: SceneTarget
      color: SceneColor
      count: number
      onMs: number
      offMs: number
      aim?: SceneAim
    }
  | { type: 'blackout'; fadeMs?: number; holdMs?: number }
  /** Demande de fumée : soumise au contrôleur sécurisé (armement, durée max, pause). */
  | { type: 'smoke'; durationMs: number }
  | { type: 'wait'; durationMs: number }

export type SceneDefinition = {
  id: string
  name: string
  /** Une scène de priorité inférieure ne peut pas interrompre la scène en cours. */
  priority: number
  steps: SceneStep[]
}

/** Contexte d'une scène : pupitre concerné (celui qui a buzzé, qui choisit, qui gagne). */
export type SceneContext = { desk: Desk | null }

/** Couleurs de la DA néon du backoffice (`frontend/src/assets/styles/main.css`). */
export const NEON = {
  primary: { r: 116, g: 88, b: 230 },
  blue: { r: 74, g: 99, b: 216 },
  cyan: { r: 87, g: 224, b: 176 },
  violet: { r: 139, g: 116, b: 255 },
  ok: { r: 87, g: 224, b: 176 },
  danger: { r: 236, g: 134, b: 161 },
  warn: { r: 240, g: 189, b: 102 },
  white: { r: 255, g: 255, b: 255, w: 255 },
} as const satisfies Record<string, Rgbw>

/** Couleur de chaque pupitre, reprise à l'écran et sur les lumières. */
export const DEFAULT_DESK_COLORS: Record<Desk, Rgb> = {
  1: NEON.cyan,
  2: NEON.violet,
  3: NEON.warn,
  4: NEON.danger,
}

export const SCENE_IDS = {
  IDLE: 'idle',
  GAME_START: 'game-start',
  ROUND_START: 'round-start',
  CHOOSER: 'chooser',
  QUESTION: 'question',
  CLIP: 'clip-playing',
  BUZZ: 'buzz',
  CORRECT: 'answer-correct',
  WRONG: 'answer-wrong',
  LOST: 'question-lost',
  ROUND_END: 'round-end',
  VICTORY: 'victory',
  IDENTIFY: 'identify',
} as const

const AMBIENT = NEON.primary

export const DEFAULT_SCENES: readonly SceneDefinition[] = [
  {
    id: SCENE_IDS.IDLE,
    name: 'Repos',
    priority: 0,
    steps: [{ type: 'color', color: AMBIENT, intensity: 0.3, fadeMs: 1500, aim: 'home' }],
  },
  {
    id: SCENE_IDS.GAME_START,
    name: 'Début de partie',
    priority: 20,
    steps: [
      { type: 'flash', color: NEON.violet, count: 3, onMs: 150, offMs: 100, aim: 'home' },
      { type: 'color', color: NEON.blue, fadeMs: 600, holdMs: 400 },
      { type: 'color', color: AMBIENT, intensity: 0.4, fadeMs: 1200 },
    ],
  },
  {
    id: SCENE_IDS.ROUND_START,
    name: 'Nouvelle manche',
    priority: 20,
    steps: [
      { type: 'flash', color: NEON.cyan, count: 2, onMs: 150, offMs: 100, aim: 'home' },
      { type: 'color', color: AMBIENT, intensity: 0.4, fadeMs: 800 },
    ],
  },
  {
    id: SCENE_IDS.CHOOSER,
    name: 'Joueur qui choisit le thème',
    priority: 20,
    steps: [
      { type: 'color', target: 'others', color: AMBIENT, intensity: 0.15, fadeMs: 300 },
      { type: 'color', target: 'desk', color: 'desk', fadeMs: 300, aim: 'desk' },
    ],
  },
  {
    id: SCENE_IDS.QUESTION,
    name: 'Question',
    priority: 10,
    steps: [{ type: 'color', color: AMBIENT, intensity: 0.25, fadeMs: 500, aim: 'home' }],
  },
  {
    id: SCENE_IDS.CLIP,
    name: 'Extrait en cours',
    priority: 10,
    steps: [{ type: 'color', color: NEON.primary, intensity: 0.55, fadeMs: 200, aim: 'home' }],
  },
  {
    id: SCENE_IDS.BUZZ,
    name: 'Buzz',
    priority: 30,
    steps: [
      { type: 'color', target: 'others', color: AMBIENT, intensity: 0.1, fadeMs: 100 },
      { type: 'flash', target: 'desk', color: 'desk', count: 3, onMs: 80, offMs: 60, aim: 'desk' },
      { type: 'color', target: 'desk', color: 'desk' },
    ],
  },
  {
    id: SCENE_IDS.CORRECT,
    name: 'Bonne réponse',
    priority: 40,
    steps: [
      {
        type: 'flash',
        target: 'desk',
        color: NEON.ok,
        count: 3,
        onMs: 120,
        offMs: 80,
        aim: 'desk',
      },
      { type: 'color', target: 'desk', color: NEON.ok, holdMs: 1500 },
      { type: 'color', color: AMBIENT, intensity: 0.3, fadeMs: 800, aim: 'home' },
    ],
  },
  {
    id: SCENE_IDS.WRONG,
    name: 'Mauvaise réponse',
    priority: 40,
    steps: [
      { type: 'flash', target: 'desk', color: NEON.danger, count: 2, onMs: 200, offMs: 120 },
      { type: 'color', target: 'desk', color: NEON.danger, intensity: 0.6, holdMs: 600 },
      // Les autres joueurs peuvent encore buzzer : retour à l'ambiance « extrait ».
      { type: 'color', color: NEON.primary, intensity: 0.55, fadeMs: 400, aim: 'home' },
    ],
  },
  {
    id: SCENE_IDS.LOST,
    name: 'Perdu pour tout le monde',
    priority: 40,
    steps: [
      { type: 'color', color: NEON.danger, intensity: 0.4, fadeMs: 300, holdMs: 1200, aim: 'home' },
      { type: 'color', color: AMBIENT, intensity: 0.25, fadeMs: 800 },
    ],
  },
  {
    id: SCENE_IDS.ROUND_END,
    name: 'Fin de manche',
    priority: 20,
    steps: [
      { type: 'flash', color: NEON.violet, count: 2, onMs: 200, offMs: 120, aim: 'home' },
      { type: 'color', color: AMBIENT, intensity: 0.35, fadeMs: 800 },
    ],
  },
  {
    id: SCENE_IDS.VICTORY,
    name: 'Victoire',
    priority: 50,
    steps: [
      { type: 'color', target: 'others', color: NEON.warn, intensity: 0.2, fadeMs: 300 },
      { type: 'smoke', durationMs: 3_000 },
      {
        type: 'flash',
        target: 'desk',
        color: NEON.warn,
        count: 6,
        onMs: 100,
        offMs: 80,
        aim: 'desk',
      },
      { type: 'color', target: 'desk', color: NEON.warn, holdMs: 4_000 },
      { type: 'color', color: AMBIENT, intensity: 0.3, fadeMs: 1500, aim: 'home' },
    ],
  },
]

/**
 * Événement de jeu → scène, avec les noms d'événements du moteur (`@quizzup/game-engine`).
 * Surchargeable par salle (`lighting.bindings`), `null` désactivant une liaison.
 */
export const DEFAULT_BINDINGS: Readonly<Record<string, string>> = Object.fromEntries([
  ['game_started', SCENE_IDS.GAME_START],
  ['round_started', SCENE_IDS.ROUND_START],
  ['round_chooser_selected', SCENE_IDS.CHOOSER],
  ['question_started', SCENE_IDS.QUESTION],
  ['blind_test_stage_started', SCENE_IDS.CLIP],
  ['blind_test_stage_resumed', SCENE_IDS.CLIP],
  ['buzzer_pressed', SCENE_IDS.BUZZ],
  ['answer_correct', SCENE_IDS.CORRECT],
  ['answer_wrong', SCENE_IDS.WRONG],
  ['question_lost', SCENE_IDS.LOST],
  ['round_ended', SCENE_IDS.ROUND_END],
  ['game_ended', SCENE_IDS.VICTORY],
  ['game_aborted', SCENE_IDS.IDLE],
])

/** Scène d'identification d'un appareil (écran de configuration : « quel spot est-ce ? »). */
export function identifyScene(fixtureId: string): SceneDefinition {
  return {
    id: SCENE_IDS.IDENTIFY,
    name: 'Identifier un appareil',
    priority: 90,
    steps: [
      { type: 'flash', target: [fixtureId], color: NEON.white, count: 4, onMs: 250, offMs: 200 },
      { type: 'color', target: [fixtureId], color: AMBIENT, intensity: 0.3, fadeMs: 300 },
    ],
  }
}

export function stepDuration(step: SceneStep): number {
  switch (step.type) {
    case 'color':
    case 'blackout':
      return Math.max(0, step.fadeMs ?? 0) + Math.max(0, step.holdMs ?? 0)
    case 'flash':
      return Math.max(0, step.count) * (Math.max(0, step.onMs) + Math.max(0, step.offMs))
    case 'wait':
      return Math.max(0, step.durationMs)
    default:
      return 0
  }
}
