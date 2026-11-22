import type { FastifyRequest } from 'fastify'
import { z } from 'zod'

import { ADMIN_ROLE_ROOM, GAME_PODIUMS } from '@quizzup/shared'

export function isRoomAccount(req: FastifyRequest): boolean {
  return req.user.role === ADMIN_ROLE_ROOM && Boolean(req.user.room_id)
}

/** Scores par pupitre envoyés par la salle (`podium` est unique dans une partie). */
export const roomScoresSchema = z
  .array(
    z.object({
      podium: z.number().int().min(1).max(GAME_PODIUMS),
      score: z.number().int().min(-1_000_000).max(1_000_000),
    })
  )
  .max(GAME_PODIUMS)
