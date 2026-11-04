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

/** Avancement d'une game, indépendant du statut de suppression logique. */
export const GAME_STATE_PENDING = 'pending' as const
export const GAME_STATE_RUNNING = 'running' as const
export const GAME_STATE_FINISHED = 'finished' as const
export const GAME_STATE_ABORTED = 'aborted' as const

export const GAME_STATE = {
  PENDING: GAME_STATE_PENDING,
  RUNNING: GAME_STATE_RUNNING,
  FINISHED: GAME_STATE_FINISHED,
  ABORTED: GAME_STATE_ABORTED,
} as const

export const GAME_STATES = [
  GAME_STATE_PENDING,
  GAME_STATE_RUNNING,
  GAME_STATE_FINISHED,
  GAME_STATE_ABORTED,
] as const

export type GameState = (typeof GAME_STATE)[keyof typeof GAME_STATE]

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

/** Format de partie et matériel d'une salle. */
export const GAME_DEFAULT_ROUNDS = 10 as const
export const GAME_DEFAULT_QUESTIONS_PER_ROUND = 10 as const
export const GAME_MAX_ROUNDS = 20 as const
export const GAME_MAX_QUESTIONS_PER_ROUND = 20 as const
export const GAME_THEMES_OFFERED_PER_ROUND = 4 as const
export const GAME_PODIUMS = 4 as const
export const GAME_BUZZERS_PER_PODIUM = 4 as const

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
 * RGPD : durée de conservation de l'email d'un joueur, en années après sa dernière partie.
 * Passé ce délai, l'email et son consentement sont effacés (purge côté backend).
 */
export const PLAYER_EMAIL_RETENTION_YEARS = 3 as const
