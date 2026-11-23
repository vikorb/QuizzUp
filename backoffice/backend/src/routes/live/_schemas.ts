import { z } from 'zod'

import { MINI_GAMES, ROOM_SCREENS } from '@quizzup/shared'
import { roomScoresSchema } from '../room/_shared'

/** Rapport d'état de la salle (`streamId` : le flux ouvert par ce poste, s'il en a un). */
export const roomStatusBodySchema = z.object({
  streamId: z.string().min(1).max(64).optional(),
  screen: z.enum(ROOM_SCREENS),
  gameId: z.number().int().positive().nullable(),
  phase: z.string().min(1).max(40).nullable(),
  round: z.number().int().min(0).max(1000).nullable(),
  questionIndex: z.number().int().min(0).max(1000).nullable(),
  miniGame: z.enum(MINI_GAMES).nullable(),
  paused: z.boolean(),
  scores: roomScoresSchema,
  audioReady: z.boolean(),
})
