import { createHash } from 'node:crypto'

import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

import {
  computeRoomSlots,
  GAME_DEFAULT_FORMAT,
  GAME_DEFAULT_QUESTIONS_PER_ROUND,
  GAME_DEFAULT_ROUNDS,
  GAME_LOCALES,
  GAME_PODIUMS,
  GAME_STATE_CANCELLED,
  GAME_STATE_SCHEDULED,
  GAME_STATUS_DELETED,
  getRoomDesksCount,
  type RoomSlot,
  type RoomSchedule,
} from '@quizzup/shared'
import db from '../../db'
import { isExclusionViolation } from '../_shared/dbErrors'
import {
  arePodiumsUnique,
  externalRefSchema,
  type GameParticipantInput,
  isoInstantSchema,
  participantSchema,
  playersCountSchema,
} from '../games/_schemas'
import {
  cancelScheduledGames,
  findGameParticipants,
  insertGameWithParticipants,
  insertParticipants,
} from '../games/_shared'
import { findBookableRooms, toPublicRoom } from './_rooms'
import { sendPublicError } from './_shared'

/** Corps limité à 16 Ko (`413 payload_too_large`). */
export const PUBLIC_BOOKING_BODY_LIMIT = 16 * 1024

const DAY_MS = 86_400_000

/** 1 à 255 caractères ASCII visibles : ni espace, ni contrôle (une valeur répétée en double est donc refusée). */
const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7E]{1,255}$/

// Le consentement aux offres du centre n'existe pas dans l'API : la case est ignorée plutôt que
// de pouvoir enregistrer un consentement que le centre n'a pas attesté.
function withoutMarketingConsent(player: unknown): unknown {
  if (typeof player !== 'object' || player === null || Array.isArray(player)) return player

  return Object.fromEntries(
    Object.entries(player)
      .filter(([key]) => key !== 'marketingConsent')
      .map(([key, value]) => [key, key === 'secondPlayer' ? withoutMarketingConsent(value) : value])
  )
}

const participantsSchema = z
  .array(z.preprocess(withoutMarketingConsent, participantSchema))
  .max(GAME_PODIUMS)

// Instant normalisé en UTC : `…+01:00` et `…Z` du même instant donnent la même empreinte.
const startsAtSchema = isoInstantSchema.transform((instant) => new Date(instant).toISOString())

const hasUniquePodiums = (body: { participants?: GameParticipantInput[] }) =>
  arePodiumsUnique(body.participants)
const duplicatedPodiums = { message: 'participants_podium_duplicated', path: ['participants'] }

const createBookingSchema = z
  .object({
    roomId: z.number().int().positive(),
    startsAt: startsAtSchema,
    playersCount: playersCountSchema.optional(),
    locale: z.enum(GAME_LOCALES).optional(),
    externalRef: externalRefSchema.optional(),
    participants: participantsSchema.optional(),
  })
  .refine(hasUniquePodiums, duplicatedPodiums)

// Au moins un champ ; `null` efface `playersCount`, `locale` et `externalRef`.
const updateBookingSchema = z
  .object({
    roomId: z.number().int().positive().optional(),
    startsAt: startsAtSchema.optional(),
    playersCount: playersCountSchema.nullable().optional(),
    locale: z.enum(GAME_LOCALES).nullable().optional(),
    externalRef: externalRefSchema.nullable().optional(),
    participants: participantsSchema.optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'empty_update',
  })
  .refine(hasUniquePodiums, duplicatedPodiums)

// Un identifiant illisible ou hors des entiers sûrs reçoit le même 404 qu'un identifiant inconnu.
const bookingParamsSchema = z.object({ id: z.coerce.number().int().positive() })

const bookingColumns = [
  'id',
  'room_id as roomId',
  'state',
  'scheduled_at as scheduledAt',
  'scheduled_end_at as scheduledEndAt',
  'players_count as playersCount',
  'locale',
  'external_ref as externalRef',
  'created_at as createdAt',
  'updated_at as updatedAt',
]

/**
 * Réservation de la compagnie, faite par l'API (`api_key_id` renseigné, quelle que soit la clé).
 * Une session du backoffice, un id inconnu ou celui d'une autre compagnie : même absence.
 * Les e-mails ne sortent jamais d'ici : seulement `hasEmail`.
 */
async function findBooking(companyId: number, id: number) {
  const row = await db('games')
    .where('company_id', companyId)
    .where('id', id)
    .whereNotNull('api_key_id')
    .whereNot('status', GAME_STATUS_DELETED)
    .first(bookingColumns)

  if (!row) return undefined

  const participants = await findGameParticipants(Number(row.id))
  const iso = (value: unknown) => new Date(value as string).toISOString()

  return {
    id: Number(row.id),
    roomId: Number(row.roomId),
    state: row.state as string,
    startsAt: iso(row.scheduledAt),
    endsAt: iso(row.scheduledEndAt),
    playersCount: row.playersCount === null ? null : Number(row.playersCount),
    locale: (row.locale as string | null) ?? null,
    externalRef: (row.externalRef as string | null) ?? null,
    participants: participants.map((participant) => ({
      podium: participant.podium,
      displayName: participant.displayName,
      hasEmail: participant.hasEmail,
      secondPlayer: participant.secondPlayer
        ? {
            displayName: participant.secondPlayer.displayName,
            hasEmail: participant.secondPlayer.hasEmail,
          }
        : null,
    })),
    createdAt: iso(row.createdAt),
    updatedAt: row.updatedAt ? iso(row.updatedAt) : null,
  }
}

/**
 * Créneau de la grille de la salle qui commence exactement à `startsAt` (UTC, ISO), sans le filtre
 * « déjà pris » : c'est la base qui tranche (`slot_taken`). Même calcul que `GET /availability`.
 * Le jour d'ouverture d'un créneau est le jour local de son début, ou la veille s'il tombe après
 * minuit ; le jour local est à 14 h au plus du jour UTC, d'où les quatre dates essayées.
 */
function findGridSlot(schedule: RoomSchedule, startsAt: string, now: Date): RoomSlot | undefined {
  const utcDay = Math.floor(Date.parse(startsAt) / DAY_MS) * DAY_MS

  for (const offset of [-2, -1, 0, 1]) {
    const date = new Date(utcDay + offset * DAY_MS).toISOString().slice(0, 10)
    const slot = computeRoomSlots({ schedule, date, now }).find((s) => s.startsAt === startsAt)

    if (slot) return slot
  }

  return undefined
}

/** Un pupitre au-delà de `bookableDesks`, ou plus de joueurs annoncés que 2 × `bookableDesks`. */
function hasTooManyPlayers(
  bookableDesks: number,
  playersCount: number | null | undefined,
  podiums: number[]
): boolean {
  return podiums.some((podium) => podium > bookableDesks) || (playersCount ?? 0) > bookableDesks * 2
}

type Refusal = { status: number; error: string }
type CreateOutcome = { gameId: number; isReplay: boolean } | Refusal

/**
 * `/public/v1/bookings` : réservations par l'API, derrière une clé. Mince adaptateur sur les
 * mêmes fonctions que le backoffice (`insertGameWithParticipants`, `cancelScheduledGames`) et sur
 * la grille de `GET /availability` (`computeRoomSlots`).
 */
const publicBookingRoutes: FastifyPluginAsync = async (app) => {
  app.post('/bookings', { bodyLimit: PUBLIC_BOOKING_BODY_LIMIT }, async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key']

    if (typeof idempotencyKey !== 'string' || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      return sendPublicError(reply, 400, 'idempotency_key_required')
    }

    const parsed = createBookingSchema.safeParse(req.body)

    if (!parsed.success) {
      return sendPublicError(reply, 400, 'invalid_body', {
        fieldErrors: parsed.error.flatten().fieldErrors,
      })
    }

    const body = parsed.data
    const { id: apiKeyId, companyId } = req.apiKey!
    // Empreinte du corps validé : la même clé avec un autre corps est refusée.
    const requestHash = createHash('sha256').update(JSON.stringify(body)).digest('hex')
    let outcome: CreateOutcome

    try {
      outcome = await db.transaction(async (trx): Promise<CreateOutcome> => {
        // Deux appels simultanés avec la même clé passent l'un après l'autre : le second voit la
        // ligne du premier et rejoue. (`game_id` est obligatoire : on ne peut pas réserver la clé
        // en premier avec l'index unique, comme le décrit la conception.)
        await trx.raw('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [
          `${companyId}:${idempotencyKey}`,
        ])

        const known = await trx('api_idempotency_keys')
          .where('company_id', companyId)
          .where('idempotency_key', idempotencyKey)
          .first(['request_hash as requestHash', 'game_id as gameId'])

        if (known) {
          return known.requestHash === requestHash
            ? { gameId: Number(known.gameId), isReplay: true }
            : { status: 422, error: 'idempotency_key_reused' }
        }

        const [room] = await findBookableRooms(companyId, body.roomId, trx)

        if (!room) return { status: 404, error: 'room_not_found' }

        const slot = findGridSlot(room.schedule, body.startsAt, new Date())

        if (!slot) return { status: 422, error: 'slot_unavailable' }

        const podiums = (body.participants ?? []).map((participant) => participant.podium)

        if (hasTooManyPlayers(toPublicRoom(room).bookableDesks, body.playersCount, podiums)) {
          return { status: 422, error: 'too_many_players' }
        }

        const gameId = await insertGameWithParticipants(
          trx,
          {
            companyId,
            roomId: room.id,
            adminId: null,
            apiKeyId,
            format: GAME_DEFAULT_FORMAT,
            roundsCount: GAME_DEFAULT_ROUNDS,
            questionsPerRound: GAME_DEFAULT_QUESTIONS_PER_ROUND,
            state: GAME_STATE_SCHEDULED,
            schedule: { startsAt: new Date(slot.startsAt), endsAt: new Date(slot.endsAt) },
            playersCount: body.playersCount,
            externalRef: body.externalRef,
            locale: body.locale,
          },
          body.participants ?? []
        )

        await trx('api_idempotency_keys').insert({
          company_id: companyId,
          api_key_id: apiKeyId,
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
          game_id: gameId,
        })

        return { gameId, isReplay: false }
      })
    } catch (error) {
      // Une autre session occupe le créneau : la contrainte d'exclusion tranche, et la transaction
      // annulée ne retient pas la clé (une nouvelle tentative avec la même clé reste possible).
      if (isExclusionViolation(error)) return sendPublicError(reply, 409, 'slot_taken')

      throw error
    }

    if ('error' in outcome) return sendPublicError(reply, outcome.status, outcome.error)

    const booking = await findBooking(companyId, outcome.gameId)

    if (!booking) return sendPublicError(reply, 404, 'booking_not_found')

    if (outcome.isReplay) reply.header('Idempotent-Replayed', 'true')

    return reply.code(201).send({ booking })
  })

  app.get('/bookings/:id', async (req, reply) => {
    const params = bookingParamsSchema.safeParse(req.params)
    const booking = params.success
      ? await findBooking(req.apiKey!.companyId, params.data.id)
      : undefined

    return booking ? { booking } : sendPublicError(reply, 404, 'booking_not_found')
  })

  app.patch('/bookings/:id', { bodyLimit: PUBLIC_BOOKING_BODY_LIMIT }, async (req, reply) => {
    const params = bookingParamsSchema.safeParse(req.params)
    const parsed = updateBookingSchema.safeParse(req.body)
    const { companyId } = req.apiKey!

    if (!params.success) return sendPublicError(reply, 404, 'booking_not_found')

    if (!parsed.success) {
      return sendPublicError(reply, 400, 'invalid_body', {
        fieldErrors: parsed.error.flatten().fieldErrors,
      })
    }

    const body = parsed.data
    const bookingId = params.data.id

    try {
      // Tout se lit et s'écrit dans la même transaction, la ligne verrouillée : le centre qui ouvre
      // la session, un autre appel ou un changement de réglage de la salle ne s'intercalent pas.
      const refusal = await db.transaction(async (trx): Promise<Refusal | null> => {
        const row = await trx('games')
          .where('company_id', companyId)
          .where('id', bookingId)
          .whereNotNull('api_key_id')
          .whereNot('status', GAME_STATUS_DELETED)
          .forUpdate()
          .first([
            'room_id as roomId',
            'state',
            'scheduled_at as scheduledAt',
            'players_count as playersCount',
            'kids_mode as kidsMode',
          ])

        if (!row) return { status: 404, error: 'booking_not_found' }

        if (row.state !== GAME_STATE_SCHEDULED) {
          return { status: 409, error: 'booking_not_modifiable' }
        }

        const currentRoomId = Number(row.roomId)
        const currentStart = new Date(row.scheduledAt as string).toISOString()
        const isRoomChanged = body.roomId !== undefined && body.roomId !== currentRoomId
        const isStartChanged = body.startsAt !== undefined && body.startsAt !== currentStart
        let slot: RoomSlot | undefined

        if (
          isRoomChanged ||
          isStartChanged ||
          body.playersCount !== undefined ||
          body.participants !== undefined
        ) {
          const roomId = body.roomId ?? currentRoomId
          const [room] = await findBookableRooms(companyId, roomId, trx)

          // Changer de salle ou d'heure exige une salle réservable. Sans cela, la réservation
          // existe déjà : fermer la salle à la réservation ne la rend pas immuable.
          if (!room && (isRoomChanged || isStartChanged)) {
            return { status: 404, error: 'room_not_found' }
          }

          if (room && (isRoomChanged || isStartChanged)) {
            slot = findGridSlot(room.schedule, body.startsAt ?? currentStart, new Date())

            if (!slot) return { status: 422, error: 'slot_unavailable' }
          }

          // Salle plus réservable : on garde au moins la limite physique de ses pupitres.
          const closedRoom = room
            ? undefined
            : await trx('rooms').where('id', roomId).first(['config'])
          const bookableDesks = room
            ? toPublicRoom(room).bookableDesks
            : getRoomDesksCount(closedRoom?.config)
          const playersCount =
            body.playersCount === undefined
              ? (row.playersCount as number | null)
              : body.playersCount
          const podiums = body.participants
            ? body.participants.map((item) => item.podium)
            : (await trx('game_participants').where('game_id', bookingId).select('podium')).map(
                (item) => Number(item.podium)
              )

          if (hasTooManyPlayers(bookableDesks, playersCount, podiums)) {
            return { status: 422, error: 'too_many_players' }
          }
        }

        const changes = {
          room_id: body.roomId,
          scheduled_at: slot?.startsAt,
          scheduled_end_at: slot?.endsAt,
          players_count: body.playersCount,
          external_ref: body.externalRef,
          locale: body.locale,
          updated_at: db.fn.now(),
        }

        await trx('games')
          .where('id', bookingId)
          .update(
            Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined))
          )

        if (body.participants) {
          await trx('game_participants').where('game_id', bookingId).delete()
          await insertParticipants(trx, bookingId, body.participants, Boolean(row.kidsMode))
        }

        return null
      })

      if (refusal) return sendPublicError(reply, refusal.status, refusal.error)
    } catch (error) {
      // Une autre session de la salle occupe déjà ce créneau : la contrainte d'exclusion tranche.
      if (isExclusionViolation(error)) return sendPublicError(reply, 409, 'slot_taken')

      throw error
    }

    return { booking: await findBooking(companyId, bookingId) }
  })

  app.delete('/bookings/:id', async (req, reply) => {
    const params = bookingParamsSchema.safeParse(req.params)
    const { companyId } = req.apiKey!
    const booking = params.success ? await findBooking(companyId, params.data.id) : undefined

    if (!booking) return sendPublicError(reply, 404, 'booking_not_found')

    // Déjà annulée : l'appel est idempotent.
    if (booking.state !== GAME_STATE_CANCELLED) {
      // L'annulation et l'effacement des e-mails passent ensemble ou pas du tout.
      const cancelled =
        booking.state === GAME_STATE_SCHEDULED
          ? await db.transaction((trx) => cancelScheduledGames(trx, { id: booking.id }))
          : 0

      // Rien d'annulé : la session est ouverte, en cours ou terminée, ou un appel simultané vient
      // de l'annuler (idempotent).
      if (cancelled === 0) {
        const current = await findBooking(companyId, booking.id)

        if (current?.state !== GAME_STATE_CANCELLED) {
          return sendPublicError(reply, 409, 'booking_not_cancellable')
        }
      }
    }

    return { booking: await findBooking(companyId, booking.id) }
  })
}

export default publicBookingRoutes
