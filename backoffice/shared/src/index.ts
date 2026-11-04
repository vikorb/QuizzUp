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

/** Mini-jeux disponibles. V1 : uniquement le blind test éclair (US-MINIGAME-01). */
export const MINI_GAME_FLASH_BLIND_TEST = 'flash_blind_test' as const

export const MINI_GAME = {
  FLASH_BLIND_TEST: MINI_GAME_FLASH_BLIND_TEST,
} as const

export const MINI_GAMES = [MINI_GAME_FLASH_BLIND_TEST] as const

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
