import {
  GAME_DEFAULT_QUESTIONS_PER_ROUND,
  GAME_DEFAULT_ROUNDS,
  GAME_MAX_QUESTIONS_PER_ROUND,
  GAME_MAX_ROUNDS,
  GAME_PARTICIPANT_DISPLAY_NAME_MAX_LENGTH,
  GAME_PODIUMS,
  ROOM_STATUS_ACTIVE,
} from '@quizzup/shared'

import type {
  CreateGameParticipantPayload,
  CreateGamePayload,
  GameFieldErrors,
  GameFormValues,
  GameParticipantFieldErrors,
  GameParticipantFormValues,
  GameRoom,
} from '@/types/game'
import { isBlank } from '@/utils/validation'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_MAX_LENGTH = 255

let participantKeySequence = 0

/** Pupitres possibles : 1 à GAME_PODIUMS. */
export function getGamePodiums(): number[] {
  return Array.from({ length: GAME_PODIUMS }, (_item, index) => index + 1)
}

export function createGameParticipantFormValues(podium: number): GameParticipantFormValues {
  participantKeySequence += 1

  return {
    key: participantKeySequence,
    podium: String(podium),
    displayName: '',
    email: '',
    // RGPD : le consentement n'est jamais pré-coché.
    emailConsent: false,
  }
}

export function createDefaultGameFormValues(): GameFormValues {
  return {
    roomId: '',
    roundsCount: String(GAME_DEFAULT_ROUNDS),
    questionsPerRound: String(GAME_DEFAULT_QUESTIONS_PER_ROUND),
    participants: [createGameParticipantFormValues(1)],
  }
}

export function createGameParticipantFieldErrors(): GameParticipantFieldErrors {
  return {
    podium: '',
    displayName: '',
    email: '',
    emailConsent: '',
  }
}

export function createGameFieldErrors(participantsCount = 0): GameFieldErrors {
  return {
    roomId: '',
    roundsCount: '',
    questionsPerRound: '',
    participants: Array.from({ length: participantsCount }, createGameParticipantFieldErrors),
  }
}

/** Premier pupitre libre, ou null si les GAME_PODIUMS pupitres sont pris. */
export function getNextFreePodium(participants: GameParticipantFormValues[]): number | null {
  const usedPodiums = new Set(participants.map((participant) => Number(participant.podium)))

  return getGamePodiums().find((podium) => !usedPodiums.has(podium)) ?? null
}

export function canAddGameParticipant(participants: GameParticipantFormValues[]): boolean {
  return participants.length < GAME_PODIUMS && getNextFreePodium(participants) !== null
}

export function canRemoveGameParticipant(participants: GameParticipantFormValues[]): boolean {
  return participants.length > 1
}

/** Seules les salles actives peuvent accueillir une partie. */
export function getActiveGameRooms(rooms: GameRoom[]): GameRoom[] {
  return rooms.filter((room) => room.status === ROOM_STATUS_ACTIVE)
}

function parseIntegerInRange(value: string, max: number): number | null {
  const trimmed = value.trim()

  if (!/^\d+$/.test(trimmed)) {
    return null
  }

  const parsed = Number(trimmed)

  return parsed >= 1 && parsed <= max ? parsed : null
}

/** Règle RGPD : un email saisi exige une case de consentement cochée explicitement. */
export function isGameParticipantConsentMissing(participant: GameParticipantFormValues): boolean {
  return !isBlank(participant.email) && participant.emailConsent !== true
}

function validateParticipant(
  participant: GameParticipantFormValues,
  duplicatedPodiums: Set<string>
): GameParticipantFieldErrors {
  const errors = createGameParticipantFieldErrors()
  const displayName = participant.displayName.trim()
  const email = participant.email.trim()

  if (parseIntegerInRange(participant.podium, GAME_PODIUMS) === null) {
    errors.podium = 'games.form.errors.podiumInvalid'
  } else if (duplicatedPodiums.has(participant.podium)) {
    errors.podium = 'games.form.errors.podiumDuplicated'
  }

  if (!displayName) {
    errors.displayName = 'games.form.errors.displayNameRequired'
  } else if (displayName.length > GAME_PARTICIPANT_DISPLAY_NAME_MAX_LENGTH) {
    errors.displayName = 'games.form.errors.displayNameTooLong'
  }

  if (email && (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email))) {
    errors.email = 'games.form.errors.emailInvalid'
  }

  if (isGameParticipantConsentMissing(participant)) {
    errors.emailConsent = 'games.form.errors.consentRequired'
  }

  return errors
}

function getDuplicatedPodiums(participants: GameParticipantFormValues[]): Set<string> {
  const seen = new Set<string>()
  const duplicated = new Set<string>()

  for (const participant of participants) {
    if (seen.has(participant.podium)) {
      duplicated.add(participant.podium)
    }

    seen.add(participant.podium)
  }

  return duplicated
}

/** Valide la saisie ; chaque erreur est une clé i18n (vide = pas d'erreur). */
export function validateGameForm(form: GameFormValues): GameFieldErrors {
  const errors = createGameFieldErrors()

  if (!form.roomId) {
    errors.roomId = 'games.form.errors.roomRequired'
  }

  if (parseIntegerInRange(form.roundsCount, GAME_MAX_ROUNDS) === null) {
    errors.roundsCount = 'games.form.errors.roundsInvalid'
  }

  if (parseIntegerInRange(form.questionsPerRound, GAME_MAX_QUESTIONS_PER_ROUND) === null) {
    errors.questionsPerRound = 'games.form.errors.questionsInvalid'
  }

  const duplicatedPodiums = getDuplicatedPodiums(form.participants)

  errors.participants = form.participants.map((participant) =>
    validateParticipant(participant, duplicatedPodiums)
  )

  return errors
}

export function hasGameFormErrors(errors: GameFieldErrors): boolean {
  return (
    Boolean(errors.roomId || errors.roundsCount || errors.questionsPerRound) ||
    errors.participants.some((participant) => Object.values(participant).some(Boolean))
  )
}

function buildParticipantPayload(
  participant: GameParticipantFormValues
): CreateGameParticipantPayload {
  const payload: CreateGameParticipantPayload = {
    podium: Number(participant.podium),
    displayName: participant.displayName.trim(),
  }
  const email = participant.email.trim()

  // Sans email, rien à consentir : on n'envoie ni l'email ni la case.
  if (email) {
    payload.email = email
    payload.emailConsent = participant.emailConsent === true
  }

  return payload
}

/** Corps de POST /companies/:companyId/games, à n'appeler qu'après validation. */
export function buildCreateGamePayload(form: GameFormValues): CreateGamePayload {
  return {
    roomId: Number(form.roomId),
    roundsCount: Number(form.roundsCount.trim()),
    questionsPerRound: Number(form.questionsPerRound.trim()),
    participants: [...form.participants]
      .map(buildParticipantPayload)
      .sort((left, right) => left.podium - right.podium),
  }
}
