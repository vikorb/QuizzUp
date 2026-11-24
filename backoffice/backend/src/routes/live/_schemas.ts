import { z } from 'zod'

import {
  GAME_COMMAND_REFUSALS,
  GAME_PHASES,
  MINI_GAMES,
  ROOM_COMMAND_RESULT,
  ROOM_COMMANDS,
  ROOM_SCREENS,
} from '@quizzup/shared'
import { roomScoresSchema } from '../room/_shared'

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
})

const commandIdSchema = z.uuid()

/** Commande du personnel : `skip` vise une question précise (`round` et `questionIndex`). */
export const roomCommandBodySchema = z.discriminatedUnion('command', [
  z.object({ commandId: commandIdSchema, command: z.enum(ROOM_COMMANDS).exclude(['skip']) }),
  z.object({
    commandId: commandIdSchema,
    command: z.enum(ROOM_COMMANDS).extract(['skip']),
    round: z.number().int().min(0).max(1000),
    questionIndex: z.number().int().min(0).max(1000),
  }),
])

export const roomCommandResultParamsSchema = z.object({ commandId: commandIdSchema })

/** Accusé de la salle : `refused` dit pourquoi ; `expired` n'est décidé que par le serveur. */
export const roomCommandResultBodySchema = z.discriminatedUnion('result', [
  z.object({ result: z.literal(ROOM_COMMAND_RESULT.APPLIED) }),
  z.object({
    result: z.literal(ROOM_COMMAND_RESULT.REFUSED),
    reason: z.enum(GAME_COMMAND_REFUSALS),
  }),
])
