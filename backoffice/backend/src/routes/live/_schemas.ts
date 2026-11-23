import { z } from 'zod'

import { GAME_PHASES, MINI_GAMES, ROOM_SCREENS } from '@quizzup/shared'
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
