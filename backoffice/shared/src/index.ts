export const COMPANY_STATUS_INACTIVE = 0 as const
export const COMPANY_STATUS_ACTIVE = 1 as const
export const COMPANY_STATUS_DELETED = 2 as const

export const COMPANY_STATUS = {
  INACTIVE: COMPANY_STATUS_INACTIVE,
  ACTIVE: COMPANY_STATUS_ACTIVE,
  DELETED: COMPANY_STATUS_DELETED,
} as const

export type CompanyStatus = (typeof COMPANY_STATUS)[keyof typeof COMPANY_STATUS]

export const ADMIN_STATUS_INACTIVE = 0 as const
export const ADMIN_STATUS_ACTIVE = 1 as const
export const ADMIN_STATUS_DELETED = 2 as const

export const ADMIN_STATUS = {
  ACTIVE: ADMIN_STATUS_ACTIVE,
  INACTIVE: ADMIN_STATUS_INACTIVE,
  DELETED: ADMIN_STATUS_DELETED,
} as const

export type AdminStatus = (typeof ADMIN_STATUS)[keyof typeof ADMIN_STATUS]

export const ADMIN_ROLE_SUPERADMIN = 'superadmin' as const
export const ADMIN_ROLE_ADMIN = 'admin' as const
export const ADMIN_ROLE_USER = 'user' as const

export const ADMIN_ROLE = {
  SUPERADMIN: ADMIN_ROLE_SUPERADMIN,
  ADMIN: ADMIN_ROLE_ADMIN,
  USER: ADMIN_ROLE_USER,
} as const

export type AdminRole = (typeof ADMIN_ROLE)[keyof typeof ADMIN_ROLE]

export const THEME_STATUS_INACTIVE = 0 as const
export const THEME_STATUS_ACTIVE = 1 as const
export const THEME_STATUS_DELETED = 2 as const
export const THEME_STATUS_DRAFT = 3 as const

export const THEME_STATUS = {
  INACTIVE: THEME_STATUS_INACTIVE,
  ACTIVE: THEME_STATUS_ACTIVE,
  DELETED: THEME_STATUS_DELETED,
  DRAFT: THEME_STATUS_DRAFT,
} as const

export const THEME_STATUSES = [
  THEME_STATUS_INACTIVE,
  THEME_STATUS_ACTIVE,
  THEME_STATUS_DELETED,
  THEME_STATUS_DRAFT,
] as const

export type ThemeStatus = (typeof THEME_STATUS)[keyof typeof THEME_STATUS]

export const THEME_MODE_CLASSIC = 'classic' as const
export const THEME_MODE_IMAGE = 'image' as const
export const THEME_MODE_AUDIO = 'audio' as const
export const THEME_MODE_MIXED = 'mixed' as const

export const THEME_MODE = {
  CLASSIC: THEME_MODE_CLASSIC,
  IMAGE: THEME_MODE_IMAGE,
  AUDIO: THEME_MODE_AUDIO,
  MIXED: THEME_MODE_MIXED,
} as const

export const THEME_MODES = [
  THEME_MODE_CLASSIC,
  THEME_MODE_IMAGE,
  THEME_MODE_AUDIO,
  THEME_MODE_MIXED,
] as const

export type ThemeMode = (typeof THEME_MODE)[keyof typeof THEME_MODE]

export const THEME_SCOPE_GLOBAL = 'global' as const
export const THEME_SCOPE_COMPANY = 'company' as const

export const THEME_SCOPE = {
  GLOBAL: THEME_SCOPE_GLOBAL,
  COMPANY: THEME_SCOPE_COMPANY,
} as const

export const THEME_SCOPES = [THEME_SCOPE_GLOBAL, THEME_SCOPE_COMPANY] as const

export type ThemeScope = (typeof THEME_SCOPE)[keyof typeof THEME_SCOPE]

export const QUESTION_STATUS_INACTIVE = 0 as const
export const QUESTION_STATUS_ACTIVE = 1 as const
export const QUESTION_STATUS_DELETED = 2 as const
export const QUESTION_STATUS_DRAFT = 3 as const

export const QUESTION_STATUS = {
  INACTIVE: QUESTION_STATUS_INACTIVE,
  ACTIVE: QUESTION_STATUS_ACTIVE,
  DELETED: QUESTION_STATUS_DELETED,
  DRAFT: QUESTION_STATUS_DRAFT,
} as const

export const QUESTION_STATUSES = [
  QUESTION_STATUS_INACTIVE,
  QUESTION_STATUS_ACTIVE,
  QUESTION_STATUS_DELETED,
  QUESTION_STATUS_DRAFT,
] as const

export type QuestionStatus = (typeof QUESTION_STATUS)[keyof typeof QUESTION_STATUS]

export const QUESTION_MEDIA_TYPE_NONE = 'none' as const
export const QUESTION_MEDIA_TYPE_IMAGE = 'image' as const
export const QUESTION_MEDIA_TYPE_AUDIO = 'audio' as const
export const QUESTION_MEDIA_TYPE_VIDEO = 'video' as const

export const QUESTION_MEDIA_TYPE = {
  NONE: QUESTION_MEDIA_TYPE_NONE,
  IMAGE: QUESTION_MEDIA_TYPE_IMAGE,
  AUDIO: QUESTION_MEDIA_TYPE_AUDIO,
  VIDEO: QUESTION_MEDIA_TYPE_VIDEO,
} as const

export const QUESTION_MEDIA_TYPES = [
  QUESTION_MEDIA_TYPE_NONE,
  QUESTION_MEDIA_TYPE_IMAGE,
  QUESTION_MEDIA_TYPE_AUDIO,
  QUESTION_MEDIA_TYPE_VIDEO,
] as const

export type QuestionMediaType = (typeof QUESTION_MEDIA_TYPE)[keyof typeof QUESTION_MEDIA_TYPE]

/**
 * Type de question (décision d'Enzo, 2026-11-04) : le moteur de jeu s'en sert pour choisir
 * les questions éligibles à chaque mini-jeu (vrai/faux, estimation…).
 */
export const QUESTION_KIND_QCM = 'qcm' as const
export const QUESTION_KIND_TRUE_FALSE = 'true_false' as const
export const QUESTION_KIND_ESTIMATE = 'estimate' as const

export const QUESTION_KIND = {
  QCM: QUESTION_KIND_QCM,
  TRUE_FALSE: QUESTION_KIND_TRUE_FALSE,
  ESTIMATE: QUESTION_KIND_ESTIMATE,
} as const

export const QUESTION_KINDS = [
  QUESTION_KIND_QCM,
  QUESTION_KIND_TRUE_FALSE,
  QUESTION_KIND_ESTIMATE,
] as const

export type QuestionKind = (typeof QUESTION_KIND)[keyof typeof QUESTION_KIND]

export const DEFAULT_QUESTION_KIND = QUESTION_KIND_QCM

const ESTIMATE_RANGE_PREFIXES = [
  'moins de',
  'plus de',
  'entre',
  'de',
  'environ',
  'au moins',
  'au plus',
  "jusqu'a",
  'avant',
  'apres',
]

// Une fourchette commence par un nombre, éventuellement précédé d'un mot (« Moins de 100 ») ou
// d'un symbole (« ≥ 1 000 »). Le texte est comparé sans accents ni casse, espaces insécables
// comprises ; la liste de mots est celle que reconnaît le moteur de jeu (`isRangeAnswer`).
const ESTIMATE_RANGE_PATTERN = new RegExp(
  String.raw`^(?:(?:${ESTIMATE_RANGE_PREFIXES.join('|')})\s+|[<>≤≥~]\s*)?-?\d`
)

function normalizeAnswerLabel(value: string): string {
  return value
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036F]/g, '')
    .replaceAll('’', "'")
    .replaceAll(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function isEstimateRange(response: string): boolean {
  return ESTIMATE_RANGE_PATTERN.test(normalizeAnswerLabel(response))
}

export const QUESTION_KIND_ANSWERS_ERROR_TRUE_FALSE = 'question_true_false_answers_invalid' as const
export const QUESTION_KIND_ANSWERS_ERROR_ESTIMATE = 'question_estimate_answers_invalid' as const

export type QuestionKindAnswersError =
  typeof QUESTION_KIND_ANSWERS_ERROR_TRUE_FALSE | typeof QUESTION_KIND_ANSWERS_ERROR_ESTIMATE

/**
 * Règles de réponses propres au type de question, calées sur le moteur de jeu (back et front) :
 * - vrai/faux : exactement « Vrai » et « Faux » (casse et accents libres), une seule juste ;
 * - estimation : 3 ou 4 fourchettes commençant par un nombre, une seule juste ;
 * - QCM : seulement les règles communes (2 réponses ou plus, au moins une juste).
 */
export function getQuestionKindAnswersError(
  kind: QuestionKind,
  answers: ReadonlyArray<{ response: string; isCorrect: boolean }>
): QuestionKindAnswersError | null {
  const correctCount = answers.filter((answer) => answer.isCorrect).length

  if (kind === QUESTION_KIND_TRUE_FALSE) {
    const labels = new Set(answers.map((answer) => normalizeAnswerLabel(answer.response)))

    return answers.length === 2 && correctCount === 1 && labels.has('vrai') && labels.has('faux')
      ? null
      : QUESTION_KIND_ANSWERS_ERROR_TRUE_FALSE
  }

  if (kind === QUESTION_KIND_ESTIMATE) {
    const validCount = answers.length >= 3 && answers.length <= 4

    return validCount &&
      correctCount === 1 &&
      answers.every((answer) => isEstimateRange(answer.response))
      ? null
      : QUESTION_KIND_ANSWERS_ERROR_ESTIMATE
  }

  return null
}

export const QUESTION_KIND_MEDIA_ERROR = 'question_kind_media_invalid' as const

/**
 * Le moteur de jeu ne tire une question vrai/faux ou estimation que si son média est un texte
 * ou une image : l'audio et la vidéo n'y sont acceptés que pour un QCM.
 */
export function getQuestionKindMediaError(
  kind: QuestionKind,
  typeMedia: QuestionMediaType
): typeof QUESTION_KIND_MEDIA_ERROR | null {
  const isPlayableMedia =
    typeMedia === QUESTION_MEDIA_TYPE_NONE || typeMedia === QUESTION_MEDIA_TYPE_IMAGE

  return kind === QUESTION_KIND_QCM || isPlayableMedia ? null : QUESTION_KIND_MEDIA_ERROR
}

export const ANSWER_STATUS_INACTIVE = 0 as const
export const ANSWER_STATUS_ACTIVE = 1 as const
export const ANSWER_STATUS_DELETED = 2 as const
export const ANSWER_STATUS_DRAFT = 3 as const

export const ANSWER_STATUS = {
  INACTIVE: ANSWER_STATUS_INACTIVE,
  ACTIVE: ANSWER_STATUS_ACTIVE,
  DELETED: ANSWER_STATUS_DELETED,
  DRAFT: ANSWER_STATUS_DRAFT,
} as const

export const ANSWER_STATUSES = [
  ANSWER_STATUS_INACTIVE,
  ANSWER_STATUS_ACTIVE,
  ANSWER_STATUS_DELETED,
  ANSWER_STATUS_DRAFT,
] as const

export type AnswerStatus = (typeof ANSWER_STATUS)[keyof typeof ANSWER_STATUS]

/**
 * Compte de salle : le PC installé dans une salle de jeu se connecte avec ce rôle.
 * Volontairement hors de `ADMIN_ROLE` : ce n'est pas un rôle attribuable depuis
 * le formulaire de comptes, il est créé depuis la fiche d'une salle (US-ROOM-02).
 */
export const ADMIN_ROLE_ROOM = 'room' as const

export const ROOM_STATUS_INACTIVE = 0 as const
export const ROOM_STATUS_ACTIVE = 1 as const
export const ROOM_STATUS_DELETED = 2 as const

export const ROOM_STATUS = {
  INACTIVE: ROOM_STATUS_INACTIVE,
  ACTIVE: ROOM_STATUS_ACTIVE,
  DELETED: ROOM_STATUS_DELETED,
} as const

export const ROOM_STATUSES = [
  ROOM_STATUS_INACTIVE,
  ROOM_STATUS_ACTIVE,
  ROOM_STATUS_DELETED,
] as const

export type RoomStatus = (typeof ROOM_STATUS)[keyof typeof ROOM_STATUS]

/** Statut « administratif » d'une game (convention commune, suppression logique). */
export const GAME_STATUS_INACTIVE = 0 as const
export const GAME_STATUS_ACTIVE = 1 as const
export const GAME_STATUS_DELETED = 2 as const

export const GAME_STATUS = {
  INACTIVE: GAME_STATUS_INACTIVE,
  ACTIVE: GAME_STATUS_ACTIVE,
  DELETED: GAME_STATUS_DELETED,
} as const

export const GAME_STATUSES = [
  GAME_STATUS_INACTIVE,
  GAME_STATUS_ACTIVE,
  GAME_STATUS_DELETED,
] as const

export type GameStatus = (typeof GAME_STATUS)[keyof typeof GAME_STATUS]

/**
 * Avancement d'une game, indépendant du statut de suppression logique. Une session programmée
 * naît `scheduled` ; « l'ouvrir » la passe `pending`. `cancelled` : session programmée annulée
 * avant d'avoir été ouverte (distinct de `aborted`, qui arrête une partie ouverte).
 */
export const GAME_STATE_SCHEDULED = 'scheduled' as const
export const GAME_STATE_PENDING = 'pending' as const
export const GAME_STATE_RUNNING = 'running' as const
export const GAME_STATE_FINISHED = 'finished' as const
export const GAME_STATE_ABORTED = 'aborted' as const
export const GAME_STATE_CANCELLED = 'cancelled' as const

export const GAME_STATE = {
  SCHEDULED: GAME_STATE_SCHEDULED,
  PENDING: GAME_STATE_PENDING,
  RUNNING: GAME_STATE_RUNNING,
  FINISHED: GAME_STATE_FINISHED,
  ABORTED: GAME_STATE_ABORTED,
  CANCELLED: GAME_STATE_CANCELLED,
} as const

/** Même ordre que le CHECK `games_state_check` (un test les compare). */
export const GAME_STATES = [
  GAME_STATE_SCHEDULED,
  GAME_STATE_PENDING,
  GAME_STATE_RUNNING,
  GAME_STATE_FINISHED,
  GAME_STATE_ABORTED,
  GAME_STATE_CANCELLED,
] as const

export type GameState = (typeof GAME_STATE)[keyof typeof GAME_STATE]

/** Pagination de `GET /companies/:companyId/games` : taille par défaut et plafond de `limit`. */
export const GAME_LIST_DEFAULT_LIMIT = 50
export const GAME_LIST_MAX_LIMIT = 200

/**
 * États qui occupent un créneau de salle : la contrainte d'exclusion
 * `games_room_schedule_no_overlap` ne joue que pour eux (terminée, arrêtée ou annulée libère).
 */
export const GAME_SLOT_STATES = [
  GAME_STATE_SCHEDULED,
  GAME_STATE_PENDING,
  GAME_STATE_RUNNING,
] as const

/**
 * Sessions programmées (lot 13). Durées en minutes. Une session s'ouvre au plus
 * `SESSION_OPEN_EARLY_MINUTES` avant son début et ne se réserve pas au-delà de
 * `SESSION_HORIZON_DAYS` jours (constante définie dans `schedule.ts`, ré-exportée en bas de ce
 * fichier).
 */
export const SESSION_DEFAULT_MINUTES = 60 as const
export const SESSION_MIN_MINUTES = 10 as const
export const SESSION_MAX_MINUTES = 240 as const
export const SESSION_MAX_BREAK_MINUTES = 120 as const
export const SESSION_OPEN_EARLY_MINUTES = 60 as const

/** Langue d'une réservation (CHECK `games.locale`). */
export const GAME_LOCALES = ['fr', 'en'] as const

export type GameLocale = (typeof GAME_LOCALES)[number]

/** Longueur maximale de `games.external_ref` (référence du système de réservation du client). */
export const GAME_EXTERNAL_REF_MAX_LENGTH = 100 as const

/**
 * Mini-jeux disponibles (catalogue du cadrage §5.2). Chaque code est implémenté
 * par un module de `game/engine/src/miniGames` et autorisé par le CHECK de
 * `game_rounds.mini_game`.
 */
export const MINI_GAME_FLASH_BLIND_TEST = 'flash_blind_test' as const
export const MINI_GAME_QUICK_ANSWER = 'quick_answer' as const
export const MINI_GAME_FIRST_BUZZ = 'first_buzz' as const
export const MINI_GAME_TRUE_FALSE = 'true_false' as const
export const MINI_GAME_DOUBLE_OR_NOTHING = 'double_or_nothing' as const
export const MINI_GAME_SUDDEN_DEATH = 'sudden_death' as const
export const MINI_GAME_POINT_STEAL = 'point_steal' as const
export const MINI_GAME_STREAK = 'streak' as const
export const MINI_GAME_ESTIMATE = 'estimate' as const
export const MINI_GAME_PROGRESSIVE_REVEAL = 'progressive_reveal' as const

export const MINI_GAME = {
  FLASH_BLIND_TEST: MINI_GAME_FLASH_BLIND_TEST,
  QUICK_ANSWER: MINI_GAME_QUICK_ANSWER,
  FIRST_BUZZ: MINI_GAME_FIRST_BUZZ,
  TRUE_FALSE: MINI_GAME_TRUE_FALSE,
  DOUBLE_OR_NOTHING: MINI_GAME_DOUBLE_OR_NOTHING,
  SUDDEN_DEATH: MINI_GAME_SUDDEN_DEATH,
  POINT_STEAL: MINI_GAME_POINT_STEAL,
  STREAK: MINI_GAME_STREAK,
  ESTIMATE: MINI_GAME_ESTIMATE,
  PROGRESSIVE_REVEAL: MINI_GAME_PROGRESSIVE_REVEAL,
} as const

/** Codes acceptés en base (`game_rounds.mini_game`), qu'ils soient déjà jouables ou non. */
export const MINI_GAMES = [
  MINI_GAME_FLASH_BLIND_TEST,
  MINI_GAME_QUICK_ANSWER,
  MINI_GAME_FIRST_BUZZ,
  MINI_GAME_TRUE_FALSE,
  MINI_GAME_DOUBLE_OR_NOTHING,
  MINI_GAME_SUDDEN_DEATH,
  MINI_GAME_POINT_STEAL,
  MINI_GAME_STREAK,
  MINI_GAME_ESTIMATE,
  MINI_GAME_PROGRESSIVE_REVEAL,
] as const

export type MiniGame = (typeof MINI_GAME)[keyof typeof MINI_GAME]

/** Raison pour laquelle un participant a été désigné pour choisir le thème d'une manche. */
export const ROUND_CHOOSER_REASON_FIRST_ROUND_RANDOM = 'first_round_random' as const
export const ROUND_CHOOSER_REASON_RANDOM_EXCLUDING_LEADER = 'random_excluding_leader' as const
export const ROUND_CHOOSER_REASON_FALLBACK_RANDOM = 'fallback_random' as const

export const ROUND_CHOOSER_REASON = {
  FIRST_ROUND_RANDOM: ROUND_CHOOSER_REASON_FIRST_ROUND_RANDOM,
  RANDOM_EXCLUDING_LEADER: ROUND_CHOOSER_REASON_RANDOM_EXCLUDING_LEADER,
  FALLBACK_RANDOM: ROUND_CHOOSER_REASON_FALLBACK_RANDOM,
} as const

export const ROUND_CHOOSER_REASONS = [
  ROUND_CHOOSER_REASON_FIRST_ROUND_RANDOM,
  ROUND_CHOOSER_REASON_RANDOM_EXCLUDING_LEADER,
  ROUND_CHOOSER_REASON_FALLBACK_RANDOM,
] as const

export type RoundChooserReason = (typeof ROUND_CHOOSER_REASON)[keyof typeof ROUND_CHOOSER_REASON]

/**
 * Motifs de refus d'une commande de pilotage d'une partie en cours (pause, reprise, passer une
 * question) : l'écran de salle les renvoie, le serveur les relaiera au backoffice.
 */
export const GAME_COMMAND_REFUSAL_ALREADY_PAUSED = 'already_paused' as const
export const GAME_COMMAND_REFUSAL_NOT_PAUSED = 'not_paused' as const
/** Passer une question est refusé pendant une pause. */
export const GAME_COMMAND_REFUSAL_PAUSED = 'paused' as const
/** Aussi pour un `skip` qui ne vise plus la question en cours (`round` ou `questionIndex` périmé). */
export const GAME_COMMAND_REFUSAL_NOT_IN_QUESTION = 'not_in_question' as const
/** Aucune partie en cours : terminée, arrêtée ou pas encore lancée. */
export const GAME_COMMAND_REFUSAL_GAME_OVER = 'game_over' as const

export const GAME_COMMAND_REFUSAL = {
  ALREADY_PAUSED: GAME_COMMAND_REFUSAL_ALREADY_PAUSED,
  NOT_PAUSED: GAME_COMMAND_REFUSAL_NOT_PAUSED,
  PAUSED: GAME_COMMAND_REFUSAL_PAUSED,
  NOT_IN_QUESTION: GAME_COMMAND_REFUSAL_NOT_IN_QUESTION,
  GAME_OVER: GAME_COMMAND_REFUSAL_GAME_OVER,
} as const

export const GAME_COMMAND_REFUSALS = [
  GAME_COMMAND_REFUSAL_ALREADY_PAUSED,
  GAME_COMMAND_REFUSAL_NOT_PAUSED,
  GAME_COMMAND_REFUSAL_PAUSED,
  GAME_COMMAND_REFUSAL_NOT_IN_QUESTION,
  GAME_COMMAND_REFUSAL_GAME_OVER,
] as const

export type GameCommandRefusal = (typeof GAME_COMMAND_REFUSAL)[keyof typeof GAME_COMMAND_REFUSAL]

/** Format de partie et matériel d'une salle. */
export const GAME_DEFAULT_ROUNDS = 10 as const
export const GAME_DEFAULT_QUESTIONS_PER_ROUND = 10 as const
export const GAME_MAX_ROUNDS = 20 as const
export const GAME_MAX_QUESTIONS_PER_ROUND = 20 as const
export const GAME_THEMES_OFFERED_PER_ROUND = 4 as const
/** Plafond de pupitres d'une salle (décision d'Enzo, 2026-11-04 : 6 au maximum). */
export const GAME_PODIUMS = 6 as const
export const GAME_BUZZERS_PER_PODIUM = 4 as const
/** Joueurs d'une partie : deux par pupitre (CHECK `games.players_count`, 1 à ce plafond). */
export const GAME_MAX_PLAYERS = GAME_PODIUMS * 2

/**
 * Formats de partie. Un format ne fixe que le nombre de manches et de questions : les mini-jeux
 * restent choisis à part. `custom` laisse les deux nombres libres (1 à `GAME_MAX_*`).
 */
export const GAME_FORMAT_DISCOVERY = 'discovery' as const
export const GAME_FORMAT_SHORT = 'short' as const
export const GAME_FORMAT_STANDARD = 'standard' as const
export const GAME_FORMAT_CUSTOM = 'custom' as const

export const GAME_FORMATS = [
  GAME_FORMAT_DISCOVERY,
  GAME_FORMAT_SHORT,
  GAME_FORMAT_STANDARD,
  GAME_FORMAT_CUSTOM,
] as const

export type GameFormat = (typeof GAME_FORMATS)[number]

export const GAME_DEFAULT_FORMAT = GAME_FORMAT_STANDARD

export type GameFormatSettings = { roundsCount: number; questionsPerRound: number }

/** Manches et questions des formats à nombres fixes (`custom` n'en a pas). */
export const GAME_FORMAT_SETTINGS: Record<
  Exclude<GameFormat, typeof GAME_FORMAT_CUSTOM>,
  GameFormatSettings
> = {
  [GAME_FORMAT_DISCOVERY]: { roundsCount: 3, questionsPerRound: 3 },
  [GAME_FORMAT_SHORT]: { roundsCount: 6, questionsPerRound: 7 },
  [GAME_FORMAT_STANDARD]: {
    roundsCount: GAME_DEFAULT_ROUNDS,
    questionsPerRound: GAME_DEFAULT_QUESTIONS_PER_ROUND,
  },
}

/**
 * Délais du moteur de jeu entre deux étapes (le moteur les réexporte sous `DEFAULT_GAME_TIMINGS`).
 * `themeChoiceMs` est un plafond : le joueur désigné choisit souvent plus vite.
 */
export const GAME_DEFAULT_TIMINGS_MS = Object.freeze({
  roundIntroMs: 4000,
  themeChoiceMs: 15_000,
  revealMs: 5000,
  roundSummaryMs: 8000,
})

/** Choix du thème en temps typique, pour l'estimation (le plafond est `themeChoiceMs`). */
export const THEME_CHOICE_TYPICAL_MS = 7000

export type DurationEstimate = { typicalMs: number; highMs: number }

/**
 * Durée d'une question de chaque mini-jeu, révélation comprise. `highMs` : toutes les échéances
 * atteintes, un buzz à la dernière seconde (le jeu de buzz ajoute alors 5 s de réponse), sans
 * mauvaise réponse (une erreur ajoute jusqu'à 5 s). `typicalMs` : hypothèses à recaler sur le
 * banc. Un test du moteur vérifie `highMs` contre ses constantes.
 */
export const MINI_GAME_QUESTION_ESTIMATES_MS: Record<MiniGame, DurationEstimate> = {
  [MINI_GAME_FLASH_BLIND_TEST]: { typicalMs: 18_000, highMs: 45_000 },
  [MINI_GAME_QUICK_ANSWER]: { typicalMs: 14_000, highMs: 20_000 },
  [MINI_GAME_FIRST_BUZZ]: { typicalMs: 14_000, highMs: 25_000 },
  [MINI_GAME_TRUE_FALSE]: { typicalMs: 6100, highMs: 8500 },
  [MINI_GAME_DOUBLE_OR_NOTHING]: { typicalMs: 18_000, highMs: 28_000 },
  [MINI_GAME_SUDDEN_DEATH]: { typicalMs: 14_000, highMs: 20_000 },
  [MINI_GAME_POINT_STEAL]: { typicalMs: 18_000, highMs: 28_000 },
  [MINI_GAME_STREAK]: { typicalMs: 14_000, highMs: 20_000 },
  [MINI_GAME_ESTIMATE]: { typicalMs: 17_000, highMs: 25_000 },
  [MINI_GAME_PROGRESSIVE_REVEAL]: { typicalMs: 16_000, highMs: 30_000 },
}

function toCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}

/**
 * Durée estimée du jeu d'une partie (hors accueil et podium), avec les délais par défaut :
 * `R × (intro + choix du thème + bilan) + R × Q × moyenne des mini-jeux`. `miniGames` absent ou
 * vide, ou sans code connu : tous. Nombres négatifs, décimaux ou non finis : ramenés à un entier ≥ 0.
 */
export function estimateGameDurationMs(input: {
  roundsCount: number
  questionsPerRound: number
  miniGames?: readonly MiniGame[]
}): DurationEstimate {
  const rounds = toCount(input.roundsCount)
  const questions = rounds * toCount(input.questionsPerRound)
  const known: readonly MiniGame[] =
    input.miniGames?.filter((miniGame) => MINI_GAMES.some((code) => code === miniGame)) ?? []
  const games = known.length ? known : MINI_GAMES
  const { roundIntroMs, themeChoiceMs, roundSummaryMs } = GAME_DEFAULT_TIMINGS_MS

  const average = (key: keyof DurationEstimate): number =>
    games.reduce((sum, miniGame) => sum + MINI_GAME_QUESTION_ESTIMATES_MS[miniGame][key], 0) /
    games.length

  return {
    typicalMs: Math.round(
      rounds * (roundIntroMs + THEME_CHOICE_TYPICAL_MS + roundSummaryMs) +
        questions * average('typicalMs')
    ),
    highMs: Math.round(
      rounds * (roundIntroMs + themeChoiceMs + roundSummaryMs) + questions * average('highMs')
    ),
  }
}

/** Pupitres d'une salle neuve (4 par défaut, réglable de 1 à `GAME_PODIUMS`). */
export const ROOM_DEFAULT_DESKS = 4 as const
export const ROOM_MIN_DESKS = 1 as const

/**
 * Nombre de pupitres d'une salle, lu dans `rooms.config.desksCount`. Config absente, ancienne ou
 * invalide : `ROOM_DEFAULT_DESKS`. Une valeur décimale ou hors bornes est ramenée dans
 * `ROOM_MIN_DESKS`..`GAME_PODIUMS`.
 */
export function getRoomDesksCount(config: unknown): number {
  const raw =
    config && typeof config === 'object' && !Array.isArray(config)
      ? (config as Record<string, unknown>).desksCount
      : undefined

  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return ROOM_DEFAULT_DESKS
  }

  return Math.min(GAME_PODIUMS, Math.max(ROOM_MIN_DESKS, Math.trunc(raw)))
}

/** Fuseau d'une salle sans réglage explicite (le fuseau est porté par la salle, pas la compagnie). */
export const ROOM_DEFAULT_TIMEZONE = 'Europe/Paris' as const

/** Jours ISO d'un horaire de créneaux : `'1'` lundi à `'7'` dimanche. */
export const ROOM_SCHEDULE_DAYS = ['1', '2', '3', '4', '5', '6', '7'] as const

export type RoomScheduleDayKey = (typeof ROOM_SCHEDULE_DAYS)[number]

/**
 * Horaires d'un jour, `HH:MM` sur 24 h, heure locale de la salle. `closesAt` ≤ `opensAt` veut
 * dire « ferme le lendemain » ; `firstSessionAt` vaut `opensAt` s'il est absent.
 */
export type RoomScheduleDay = {
  opensAt: string
  firstSessionAt?: string
  closesAt: string
}

/**
 * Réglages de créneaux d'une salle (`rooms.schedule`, jsonb, nul = pas de créneaux, salle non
 * réservable). Une clé absente de `days` veut dire jour fermé.
 */
export type RoomSchedule = {
  timezone: string
  slotMinutes: number
  breakMinutes: number
  bookableDesks: number
  publicBooking: boolean
  days: Partial<Record<RoomScheduleDayKey, RoomScheduleDay>>
}

/** Graine de tirage d'une partie : entier 32 bits (générateur du moteur de jeu). */
export const GAME_SEED_MAX = 0xff_ff_ff_ff

/** Participant d'une partie (US-GAME-08). */
export const GAME_PARTICIPANT_DISPLAY_NAME_MAX_LENGTH = 100 as const

/**
 * Extraits audio des questions (US-MEDIA-01). Formats lus par Chrome / Edge sur le PC de
 * salle ; `audio/mp3` est un alias non standard envoyé par certains navigateurs pour le mp3.
 */
export const QUESTION_AUDIO_MIME_TYPE_MPEG = 'audio/mpeg' as const
export const QUESTION_AUDIO_MIME_TYPE_OGG = 'audio/ogg' as const

export const QUESTION_AUDIO_MIME_TYPES = [
  QUESTION_AUDIO_MIME_TYPE_MPEG,
  QUESTION_AUDIO_MIME_TYPE_OGG,
] as const

export type QuestionAudioMimeType = (typeof QUESTION_AUDIO_MIME_TYPES)[number]

export const QUESTION_AUDIO_MIME_TYPE_ALIASES: Readonly<Record<string, QuestionAudioMimeType>> = {
  'audio/mpeg': QUESTION_AUDIO_MIME_TYPE_MPEG,
  'audio/mp3': QUESTION_AUDIO_MIME_TYPE_MPEG,
  'audio/ogg': QUESTION_AUDIO_MIME_TYPE_OGG,
}

export const QUESTION_AUDIO_EXTENSIONS: Readonly<Record<QuestionAudioMimeType, string>> = {
  [QUESTION_AUDIO_MIME_TYPE_MPEG]: 'mp3',
  [QUESTION_AUDIO_MIME_TYPE_OGG]: 'ogg',
}

/** Taille max par défaut d'un extrait (surchargée côté API par `MEDIA_MAX_BYTES`). */
export const QUESTION_AUDIO_DEFAULT_MAX_BYTES = 10 * 1024 * 1024

/**
 * Durée d'écoute à garantir après le point de départ : le palier le plus long du blind test
 * éclair (20 s, porté par le moteur de jeu). En dessous, le backoffice avertit seulement.
 */
export const QUESTION_AUDIO_RECOMMENDED_EXCERPT_MS = 20_000

/**
 * Extrait audio fourni par un service d'extraits plutôt que par un fichier importé : la question
 * garde seulement le fournisseur et la référence du titre. Un seul fournisseur aujourd'hui.
 */
export const QUESTION_MEDIA_PROVIDER_DEEZER = 'deezer' as const

export const QUESTION_MEDIA_PROVIDERS = [QUESTION_MEDIA_PROVIDER_DEEZER] as const

export type QuestionMediaProvider = (typeof QUESTION_MEDIA_PROVIDERS)[number]

/**
 * Effet joué sur l'extrait d'une question audio (blind test) : choisi par question, car la
 * reconnaissance d'un extrait transformé dépend de l'extrait. Même liste que `EXTRACT_EFFECTS`
 * de `@quizzup/audio` (`short` est appliqué par le moteur, les autres par le lecteur).
 */
export const QUESTION_AUDIO_EFFECT_NONE = 'none' as const
export const QUESTION_AUDIO_EFFECT_SHORT = 'short' as const
export const QUESTION_AUDIO_EFFECT_REVERSE = 'reverse' as const
export const QUESTION_AUDIO_EFFECT_SLOWED = 'slowed' as const

export const QUESTION_AUDIO_EFFECTS = [
  QUESTION_AUDIO_EFFECT_NONE,
  QUESTION_AUDIO_EFFECT_SHORT,
  QUESTION_AUDIO_EFFECT_REVERSE,
  QUESTION_AUDIO_EFFECT_SLOWED,
] as const

export type QuestionAudioEffect = (typeof QUESTION_AUDIO_EFFECTS)[number]

/** Durée de l'extrait fourni par le fournisseur. */
export const QUESTION_MEDIA_PROVIDER_EXTRACT_MS = 30_000

/** Longueur minimale d'une recherche de titre (vérifiée par l'API, aussi par l'écran). */
export const QUESTION_MEDIA_PROVIDER_SEARCH_MIN_LENGTH = 2

/** Questions demandées au plus par appel au contenu de la salle (`?ids=`). */
export const ROOM_CONTENT_MAX_IDS = 200

/**
 * RGPD : durée de conservation de l'email d'un joueur, en années après sa dernière partie.
 * Passé ce délai, l'email et son consentement sont effacés (purge côté backend).
 */
export const PLAYER_EMAIL_RETENTION_YEARS = 3 as const

/**
 * Présence des salles en direct (US-LIVE-01). Deux flux SSE : la salle (`GET /room/stream`) et le
 * personnel d'une compagnie (`GET /companies/:companyId/live`). Les noms d'événements, les
 * délais et le lecteur de flux `createSseParser` sont communs au serveur et aux deux clients.
 */
export const LIVE_EVENT = {
  /** Premier événement du flux de la salle : `{ streamId, heartbeatMs, statusEveryMs }`. */
  HELLO: 'hello',
  /** Un autre poste de la même salle a ouvert son flux : celui-ci est fermé. */
  REPLACED: 'replaced',
  /** La session n'est plus valable : le flux est fermé juste après. */
  SESSION_ENDED: 'session_ended',
  /** Premier événement du flux du personnel : `{ rooms: RoomLive[] }`. */
  SNAPSHOT: 'snapshot',
  /** Changement d'état d'une salle : `RoomLive`. */
  ROOM_STATUS: 'room_status',
  /** Une session programmée a été créée, modifiée, annulée ou ouverte : `{ roomId }`. */
  SCHEDULE_CHANGED: 'schedule_changed',
  /** Flux de la salle : une commande du personnel à proposer au moteur, `RoomCommandMessage`. */
  COMMAND: 'command',
  /** Flux du personnel : l'accusé (ou l'expiration) d'une commande, `RoomCommandResultMessage`. */
  COMMAND_RESULT: 'command_result',
} as const

export type LiveEvent = (typeof LIVE_EVENT)[keyof typeof LIVE_EVENT]

/** Écran affiché par le PC de la salle. */
export const ROOM_SCREENS = ['launch', 'lobby', 'play', 'setup', 'other'] as const

export type RoomScreen = (typeof ROOM_SCREENS)[number]

/**
 * Phases du moteur de jeu (`GamePhase` de `game/engine`), telles que la salle les publie. Un test
 * de contrat du moteur échoue si cette liste et le moteur divergent.
 */
export const GAME_PHASE_LOBBY = 'lobby' as const
export const GAME_PHASE_FINISHED = 'finished' as const
export const GAME_PHASE_ABORTED = 'aborted' as const

export const GAME_PHASES = [
  GAME_PHASE_LOBBY,
  'round_intro',
  'theme_choice',
  'question',
  'reveal',
  'round_summary',
  GAME_PHASE_FINISHED,
  GAME_PHASE_ABORTED,
] as const

export type GamePhaseName = (typeof GAME_PHASES)[number]

/** Phases où la salle est connectée mais ne joue pas. */
export const GAME_IDLE_PHASES: ReadonlyArray<GamePhaseName> = [
  GAME_PHASE_LOBBY,
  GAME_PHASE_FINISHED,
  GAME_PHASE_ABORTED,
]

export const ROOM_PRESENCE = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  IN_GAME: 'in_game',
} as const

export type RoomPresence = (typeof ROOM_PRESENCE)[keyof typeof ROOM_PRESENCE]

/** Délai entre deux lignes `: ping` d'un flux ouvert. */
export const LIVE_HEARTBEAT_MS = 15_000 as const
/** Délai entre deux `POST /room/status` d'une salle. */
export const LIVE_STATUS_EVERY_MS = 15_000 as const
/** Sans rapport depuis ce délai, la salle est hors ligne. */
export const LIVE_OFFLINE_AFTER_MS = 45_000 as const

/** Rapport d'état envoyé par l'écran de salle (aucune donnée de joueur). */
export type RoomStatusReport = {
  screen: RoomScreen
  gameId: number | null
  phase: GamePhaseName | null
  round: number | null
  questionIndex: number | null
  miniGame: MiniGame | null
  paused: boolean
  scores: { podium: number; score: number }[]
  audioReady: boolean
}

/** État d'une salle tel que le voit le personnel. */
export type RoomLive = {
  roomId: number
  presence: RoomPresence
  /** En ligne et flux de la salle ouvert : une commande à distance peut l'atteindre. */
  controllable: boolean
  /** Date ISO du dernier rapport reçu, `null` si la salle n'en a jamais envoyé. */
  lastSeenAt: string | null
  status: RoomStatusReport | null
}

/**
 * Commandes à distance (US-LIVE-01) : le personnel propose, l'écran de salle applique ou refuse.
 * `skip` vise une question précise : la salle le refuse (`not_in_question`) si `round` et
 * `questionIndex` ne sont plus ceux de la partie. `abort` vise une partie précise : la salle le
 * refuse si `gameId` n'est pas celle qu'elle joue.
 */
export const ROOM_COMMANDS = ['pause', 'resume', 'skip', 'abort'] as const

export type RoomCommandName = (typeof ROOM_COMMANDS)[number]

/** Sans accusé de la salle au bout de ce délai, la commande est `expired`. */
export const ROOM_COMMAND_TIMEOUT_MS = 10_000 as const

export const ROOM_COMMAND_RESULT = {
  APPLIED: 'applied',
  REFUSED: 'refused',
  EXPIRED: 'expired',
} as const

export type RoomCommandResult = (typeof ROOM_COMMAND_RESULT)[keyof typeof ROOM_COMMAND_RESULT]

export type RoomCommand =
  | { command: 'pause' | 'resume' }
  | { command: 'skip'; round: number; questionIndex: number }
  | { command: 'abort'; gameId: number }

/** Charge utile de l'événement `command` du flux de la salle. */
export type RoomCommandMessage = RoomCommand & { commandId: string }

/** Charge utile de l'événement `command_result` du flux du personnel (`reason` si `refused`). */
export type RoomCommandResultMessage = {
  commandId: string
  roomId: number
  command: RoomCommandName
  result: RoomCommandResult
  reason?: GameCommandRefusal
}

export type SseMessage = { event: string; data: string }

/**
 * Lecteur de flux `text/event-stream`. Reçoit des morceaux de texte coupés n'importe où et appelle
 * `onEvent` pour chaque événement complet (`event` vaut `message` si le champ est absent, `data`
 * joint les lignes `data:` par `\n`). Les commentaires (`: ping`) et les champs inconnus sont ignorés.
 */
export function createSseParser(onEvent: (message: SseMessage) => void): (chunk: string) => void {
  let pending = ''
  let event = ''
  let data: string[] = []
  // Un `\r\n` coupé entre deux morceaux ne doit compter que pour une fin de ligne.
  let skipLineFeed = false

  return (chunk) => {
    pending += skipLineFeed && chunk.startsWith('\n') ? chunk.slice(1) : chunk
    skipLineFeed = chunk.endsWith('\r')

    const lines = pending.split(/\r\n|\n|\r/)
    pending = lines.pop() ?? ''

    for (const line of lines) {
      if (line === '') {
        if (data.length > 0) {
          onEvent({ event: event || 'message', data: data.join('\n') })
        }
        event = ''
        data = []
      } else if (!line.startsWith(':')) {
        const colon = line.indexOf(':')
        const field = colon === -1 ? line : line.slice(0, colon)
        const rawValue = colon === -1 ? '' : line.slice(colon + 1)
        const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue

        if (field === 'event') {
          event = value
        } else if (field === 'data') {
          data.push(value)
        }
      }
    }
  }
}

// Journaux d'erreurs des salles (lot 7e)
export * from './roomLogs.js'
export * from './logos.js'
export * from './demoRequests.js'
export * from './schedule.js'
export * from './questionImport.js'
export * from './stats.js'
export * from './totp.js'
export * from './publicApi.js'
