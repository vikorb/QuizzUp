import { z } from 'zod'

import {
  BUZZER_SOURCE_KINDS,
  GAME_PHASES,
  LIGHTING_DRIVERS,
  LIGHTING_OUTPUT_STATUSES,
  MINI_GAMES,
  ROOM_DIAGNOSTICS_MAX_GAMEPADS,
  ROOM_LOG_APP_VERSION_MAX_LENGTH,
  ROOM_SCREENS,
} from '@quizzup/shared'
import { roomScoresSchema } from '../room/_shared'

/**
 * Comme `phase` : une valeur que ce serveur ne comprend pas (écran de salle plus récent, type ou borne
 * non respectés) devient `null` au lieu de refuser le rapport. Le diagnostic ne doit jamais faire
 * paraître une salle hors ligne.
 */
const orNull = <T extends z.ZodType>(schema: T) =>
  // `optional` : une clé absente passe aussi par la transformation et vaut `null`.
  z
    .unknown()
    .optional()
    .transform((value): z.output<T> | null => {
      const parsed = schema.safeParse(value)

      return parsed.success ? parsed.data : null
    })

/**
 * État matériel de la salle, borné (gardé en mémoire, jamais stocké). Un champ inconnu est retiré, un
 * champ invalide ou absent vaut `null`.
 */
const roomDiagnosticsSchema = z.object({
  appVersion: orNull(z.string().min(1).max(ROOM_LOG_APP_VERSION_MAX_LENGTH)),
  buzzerSource: orNull(z.enum(BUZZER_SOURCE_KINDS)),
  gamepadCount: orNull(z.number().int().min(0).max(ROOM_DIAGNOSTICS_MAX_GAMEPADS)),
  lightingDriver: orNull(z.enum(LIGHTING_DRIVERS)),
  lightingStatus: orNull(z.enum(LIGHTING_OUTPUT_STATUSES)),
  smokeEnabled: orNull(z.boolean()),
  smokeArmed: orNull(z.boolean()),
  lastErrorAt: orNull(z.iso.datetime()),
})

/** Rapport d'état de la salle (`streamId` : le flux ouvert par ce poste, s'il en a un). */
export const roomStatusBodySchema = z.object({
  streamId: z.string().min(1).max(64).optional(),
  screen: z.enum(ROOM_SCREENS),
  gameId: z.number().int().positive().nullable(),
  // Une phase que ce serveur ne connaît pas (écran de salle plus récent) devient `null` : le rapport
  // n'est pas refusé, la salle ne doit pas paraître hors ligne pour autant.
  phase: z
    .string()
    .nullable()
    .transform((phase) => GAME_PHASES.find((known) => known === phase) ?? null),
  round: z.number().int().min(0).max(1000).nullable(),
  questionIndex: z.number().int().min(0).max(1000).nullable(),
  miniGame: z.enum(MINI_GAMES).nullable(),
  paused: z.boolean(),
  // Un pupitre n'a qu'un score : deux lignes pour le même pupitre sont refusées.
  scores: roomScoresSchema.refine(
    (scores) => new Set(scores.map((line) => line.podium)).size === scores.length
  ),
  audioReady: z.boolean(),
  // Absent des écrans de salle plus anciens, ou illisible : le rapport reste valide, sans diagnostic.
  diagnostics: roomDiagnosticsSchema.optional().catch(undefined),
})
