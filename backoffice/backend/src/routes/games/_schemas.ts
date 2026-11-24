import {
  GAME_DEFAULT_FORMAT,
  GAME_DEFAULT_QUESTIONS_PER_ROUND,
  GAME_DEFAULT_ROUNDS,
  GAME_EXTERNAL_REF_MAX_LENGTH,
  GAME_FORMAT_CUSTOM,
  GAME_FORMAT_SETTINGS,
  GAME_FORMATS,
  GAME_LIST_DEFAULT_LIMIT,
  GAME_LIST_MAX_LIMIT,
  GAME_LOCALES,
  GAME_MAX_PLAYERS,
  GAME_MAX_QUESTIONS_PER_ROUND,
  GAME_MAX_ROUNDS,
  GAME_PARTICIPANT_DISPLAY_NAME_MAX_LENGTH,
  GAME_PODIUMS,
  GAME_STATES,
  type GameFormat,
  MINI_GAMES,
  SESSION_MAX_MINUTES,
  SESSION_MIN_MINUTES,
} from '@quizzup/shared'
import { z } from 'zod'

export const gamesParamsSchema = z.object({
  companyId: z.coerce.number().int().positive(),
})

export const gameParamsSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  gameId: z.coerce.number().int().positive(),
})

export const registrationParamsSchema = gameParamsSchema.extend({
  registrationId: z.coerce.number().int().positive(),
})

export const participantParamsSchema = gameParamsSchema.extend({
  participantId: z.coerce.number().int().positive(),
})

/** Pupitre choisi pour une demande validée ; absent : le plus petit pupitre libre de la salle. */
export const acceptRegistrationSchema = z.object({
  podium: z.number().int().min(1).max(GAME_PODIUMS).optional(),
})

// L'année 0 est valide en ISO 8601 mais PostgreSQL la refuse (pas d'année 0) : 500 sinon. On
// contrôle l'instant résolu, car un décalage peut y ramener une date écrite en l'an 1
// (`0001-01-01T00:00:00+14:00`).
export const isoInstantSchema = z.iso
  .datetime({ offset: true })
  .refine((instant) => new Date(instant).getUTCFullYear() >= 1)
const periodBoundSchema = isoInstantSchema.optional()

/** Début d'une session programmée : à la minute près (secondes et millisecondes à 0). */
const scheduledAtSchema = isoInstantSchema.refine(
  (instant) => {
    const date = new Date(instant)

    return date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0
  },
  { message: 'scheduled_at_not_minute' }
)

/**
 * Filtres et pagination de la liste. `from` et `to` sont des instants ISO 8601 avec fuseau, en
 * intervalle semi-ouvert `[from, to)` : `to` est exclu (le frontend envoie le début du jour
 * suivant en heure locale, le jour d'une salle n'est pas le jour UTC).
 * `limit` au-delà du plafond est ramené au plafond ; 0 ou négatif est refusé.
 */
export const gamesListQuerySchema = z.object({
  state: z.enum(GAME_STATES).optional(),
  roomId: z.coerce.number().int().positive().optional(),
  from: periodBoundSchema,
  to: periodBoundSchema,
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .transform((limit) => Math.min(limit, GAME_LIST_MAX_LIMIT))
    .default(GAME_LIST_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
})

export const emailSchema = z.string().trim().toLowerCase().email().max(255).optional().nullable()
const displayNameSchema = z.string().trim().min(1).max(GAME_PARTICIPANT_DISPLAY_NAME_MAX_LENGTH)

// RGPD : la case doit être cochée explicitement pour qu'un email soit gardé.
export function hasConsentIfEmail(player: {
  email?: string | null
  emailConsent?: boolean
}): boolean {
  return !player.email || player.emailConsent === true
}

// Consentement aux offres du centre : distinct de la conservation de l'email, mais sans email
// il n'y a personne à qui écrire.
export function hasEmailIfMarketing(player: {
  email?: string | null
  marketingConsent?: boolean
}): boolean {
  return player.marketingConsent !== true || Boolean(player.email)
}

/** 2e joueur facultatif d'un pupitre : son propre nom et son propre email RGPD. */
const secondPlayerSchema = z
  .object({
    displayName: displayNameSchema,
    email: emailSchema,
    emailConsent: z.boolean().optional(),
    marketingConsent: z.boolean().optional(),
  })
  .refine(hasConsentIfEmail, { message: 'email_consent_required', path: ['emailConsent'] })
  .refine(hasEmailIfMarketing, {
    message: 'marketing_consent_requires_email',
    path: ['marketingConsent'],
  })

export const participantSchema = z
  .object({
    podium: z.number().int().min(1).max(GAME_PODIUMS),
    displayName: displayNameSchema,
    email: emailSchema,
    emailConsent: z.boolean().optional(),
    marketingConsent: z.boolean().optional(),
    secondPlayer: secondPlayerSchema.optional().nullable(),
  })
  .refine(hasConsentIfEmail, { message: 'email_consent_required', path: ['emailConsent'] })
  .refine(hasEmailIfMarketing, {
    message: 'marketing_consent_requires_email',
    path: ['marketingConsent'],
  })

export type GameParticipantInput = z.infer<typeof participantSchema>

const roundsCountSchema = z.number().int().min(1).max(GAME_MAX_ROUNDS)
const questionsPerRoundSchema = z.number().int().min(1).max(GAME_MAX_QUESTIONS_PER_ROUND)
export const durationMinutesSchema = z
  .number()
  .int()
  .min(SESSION_MIN_MINUTES)
  .max(SESSION_MAX_MINUTES)
export const playersCountSchema = z.number().int().min(1).max(GAME_MAX_PLAYERS)
export const externalRefSchema = z.string().trim().min(1).max(GAME_EXTERNAL_REF_MAX_LENGTH)
const participantsSchema = z.array(participantSchema).max(GAME_PODIUMS)

// Programme de la partie : absent, tous les mini-jeux du moteur.
const miniGamesSchema = z
  .array(z.enum(MINI_GAMES))
  .min(1)
  .max(MINI_GAMES.length)
  .refine((miniGames) => new Set(miniGames).size === miniGames.length, {
    message: 'mini_games_duplicated',
  })

export const arePodiumsUnique = (participants: GameParticipantInput[] = []) =>
  new Set(participants.map((item) => item.podium)).size === participants.length

/**
 * Format et nombres d'une création : un format fixe (`discovery`, `short`, `standard`) donne les
 * nombres de `GAME_FORMAT_SETTINGS` ; des nombres sans format font un `custom` ; rien d'envoyé,
 * le format par défaut. Un format fixe accompagné de nombres est refusé par le schéma.
 */
function resolveGameFormat<
  T extends { format?: GameFormat; roundsCount?: number; questionsPerRound?: number },
>(body: T) {
  const hasCounts = body.roundsCount !== undefined || body.questionsPerRound !== undefined
  const format = body.format ?? (hasCounts ? GAME_FORMAT_CUSTOM : GAME_DEFAULT_FORMAT)
  const counts =
    format === GAME_FORMAT_CUSTOM
      ? {
          roundsCount: body.roundsCount ?? GAME_DEFAULT_ROUNDS,
          questionsPerRound: body.questionsPerRound ?? GAME_DEFAULT_QUESTIONS_PER_ROUND,
        }
      : GAME_FORMAT_SETTINGS[format]

  return { ...body, format, ...counts }
}

export const createGameSchema = z
  .object({
    // Les ids bigint sortent de l'API en texte : on accepte "7" comme 7.
    roomId: z.coerce.number().int().positive(),
    format: z.enum(GAME_FORMATS).optional(),
    roundsCount: roundsCountSchema.optional(),
    questionsPerRound: questionsPerRoundSchema.optional(),
    // Une session programmée peut n'avoir aucun joueur nommé (arbitrage 6).
    participants: participantsSchema.default([]),
    // Ouvre tout de suite le lien d'inscription par QR code (partie immédiate) : sans joueur à la
    // création, les joueurs s'inscrivent ensuite. Ignoré pour une session programmée.
    openJoin: z.boolean().optional(),
    // La liste complète est ramenée à « absent » (stocké `null`), comme le fait le formulaire :
    // un futur mini-jeu sera ainsi inclus d'office.
    miniGames: miniGamesSchema
      .transform((miniGames) => (miniGames.length === MINI_GAMES.length ? undefined : miniGames))
      .optional(),
    scheduledAt: scheduledAtSchema.optional(),
    durationMinutes: durationMinutesSchema.optional(),
    playersCount: playersCountSchema.optional(),
    externalRef: externalRefSchema.optional(),
    locale: z.enum(GAME_LOCALES).optional(),
    kidsMode: z.boolean().optional(),
  })
  .refine(
    (body) =>
      body.scheduledAt !== undefined || body.openJoin === true || body.participants.length >= 1,
    {
      message: 'participants_required',
      path: ['participants'],
    }
  )
  .refine((body) => body.scheduledAt !== undefined || body.durationMinutes === undefined, {
    message: 'duration_requires_scheduled_at',
    path: ['durationMinutes'],
  })
  .refine((body) => arePodiumsUnique(body.participants), {
    message: 'participants_podium_duplicated',
    path: ['participants'],
  })
  .refine(
    (body) =>
      body.format === undefined ||
      body.format === GAME_FORMAT_CUSTOM ||
      (body.roundsCount === undefined && body.questionsPerRound === undefined),
    { message: 'format_fixes_counts', path: ['format'] }
  )
  .transform(resolveGameFormat)

/**
 * Modification d'une session `scheduled` : au moins un champ, les absents sont gardés.
 * `participants` remplace la liste complète. `playersCount`, `externalRef` et `locale` acceptent
 * `null` pour être effacés.
 */
export const updateGameSchema = z
  .object({
    roomId: z.coerce.number().int().positive().optional(),
    scheduledAt: scheduledAtSchema.optional(),
    durationMinutes: durationMinutesSchema.optional(),
    // Le format ne se change pas à la main : il passe à `custom` quand les nombres changent.
    format: z.never({ error: 'format_not_updatable' }).optional(),
    roundsCount: roundsCountSchema.optional(),
    questionsPerRound: questionsPerRoundSchema.optional(),
    // Ici « absent » veut dire « inchangé » : la liste complète s'écrit `null` (tous les mini-jeux).
    miniGames: miniGamesSchema
      .transform((miniGames) => (miniGames.length === MINI_GAMES.length ? null : miniGames))
      .optional(),
    playersCount: playersCountSchema.nullable().optional(),
    externalRef: externalRefSchema.nullable().optional(),
    locale: z.enum(GAME_LOCALES).nullable().optional(),
    kidsMode: z.boolean().optional(),
    participants: participantsSchema.optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'empty_update',
  })
  .refine((body) => arePodiumsUnique(body.participants), {
    message: 'participants_podium_duplicated',
    path: ['participants'],
  })
