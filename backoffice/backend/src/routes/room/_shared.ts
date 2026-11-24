import type { FastifyRequest } from 'fastify'
import { z } from 'zod'

import { ADMIN_ROLE_ROOM, GAME_PODIUMS } from '@quizzup/shared'

export function isRoomAccount(req: FastifyRequest): boolean {
  return req.user.role === ADMIN_ROLE_ROOM && Boolean(req.user.room_id)
}

/** Pupitres des participants que la salle a chargés (distincts, au plus `GAME_PODIUMS`). */
export const roomPodiumsSchema = z
  .array(z.number().int().min(1).max(GAME_PODIUMS))
  .max(GAME_PODIUMS)
  .refine((podiums) => new Set(podiums).size === podiums.length)

/** Scores par pupitre envoyés par la salle (`podium` est unique dans une partie). */
export const roomScoresSchema = z
  .array(
    z.object({
      podium: z.number().int().min(1).max(GAME_PODIUMS),
      score: z.number().int().min(-1_000_000).max(1_000_000),
    })
  )
  .max(GAME_PODIUMS)
