import type { MiniGame } from '@quizzup/shared'
import {
  GAME_DEFAULT_QUESTIONS_PER_ROUND,
  GAME_DEFAULT_ROUNDS,
  GAME_MAX_PLAYERS,
  GAME_MAX_QUESTIONS_PER_ROUND,
  GAME_MAX_ROUNDS,
  GAME_PARTICIPANT_DISPLAY_NAME_MAX_LENGTH,
  GAME_PODIUMS,
  MINI_GAMES,
  ROOM_DEFAULT_DESKS,
  ROOM_DEFAULT_TIMEZONE,
  ROOM_STATUS_ACTIVE,
  SESSION_MAX_MINUTES,
  SESSION_MIN_MINUTES,
  zonedLocalToUtc,
} from '@quizzup/shared'

import type {
  CreateGameParticipantPayload,
  CreateGamePayload,
  CreateGameSecondPlayerPayload,
  Game,
  GameFieldErrors,
  GameFormValues,
  GameParticipant,
  GameParticipantFieldErrors,
  GameParticipantFormValues,
  GameRoom,
  UpdateGamePayload,
} from '@/types/game'
import {
  formatAgendaTime,
  getLocalDate,
  getRoomTimezone,
  isCalendarDate,
} from '@/utils/game/agenda'
import { parseGameId } from '@/utils/game/company'
import { isBlank } from '@/utils/validation'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_MAX_LENGTH = 255
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
// Un instant ISO 8601 complet, avec `Z` ou un décalage : ce que porte le lien d'un créneau de l'agenda.
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/
const MINUTE_MS = 60_000

let participantKeySequence = 0

/** Pupitres possibles : 1 à `desksCount` (au plus GAME_PODIUMS). */
export function getGamePodiums(desksCount: number = GAME_PODIUMS): number[] {
  return Array.from({ length: clampDesksCount(desksCount) }, (_item, index) => index + 1)
}

function clampDesksCount(desksCount: number): number {
  return Math.min(GAME_PODIUMS, Math.max(1, Math.trunc(desksCount) || 1))
}

/**
 * Pupitres de la salle choisie (au plus GAME_PODIUMS). Sans salle choisie, ou salle inconnue
 * ou sans nombre (ancienne réponse), on propose ceux d'une salle neuve.
 */
export function getGameRoomDesksCount(rooms: GameRoom[], roomId: string): number {
  const room = rooms.find((item) => String(item.id) === roomId)

  return typeof room?.desksCount === 'number'
    ? clampDesksCount(room.desksCount)
    : ROOM_DEFAULT_DESKS
}

/**
 * Change de salle : les participants dont le pupitre n'existe plus dans la nouvelle salle
 * prennent le premier pupitre libre. Ceux pour qui il n'y a plus de place sont à retirer.
 * Renvoie les index à retirer (ordre décroissant, prêts à être « spliced »), sans toucher
 * aux participants conservés tels quels.
 */
export function fitGameParticipantsToDesks(
  participants: GameParticipantFormValues[],
  desksCount: number
): number[] {
  const max = clampDesksCount(desksCount)
  const used = new Set(
    participants.map((participant) => Number(participant.podium)).filter((podium) => podium <= max)
  )
  const toRemove: number[] = []

  participants.forEach((participant, index) => {
    if (Number(participant.podium) <= max) {
      return
    }

    const free = getGamePodiums(max).find((podium) => !used.has(podium))

    if (free === undefined) {
      toRemove.push(index)
      return
    }

    used.add(free)
    Object.assign(participant, { podium: String(free) })
  })

  return toRemove.reverse()
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
    marketingConsent: false,
    hasSecondPlayer: false,
    ...createEmptySecondPlayerValues(),
  }
}

type SecondPlayerValues = Pick<
  GameParticipantFormValues,
  'secondDisplayName' | 'secondEmail' | 'secondEmailConsent' | 'secondMarketingConsent'
>

function createEmptySecondPlayerValues(): SecondPlayerValues {
  return {
    secondDisplayName: '',
    secondEmail: '',
    // RGPD : le consentement du 2e joueur n'est jamais pré-coché non plus.
    secondEmailConsent: false,
    secondMarketingConsent: false,
  }
}

/** Ouvre le bloc du 2e joueur d'un pupitre, vierge. */
export function openGameSecondPlayer(participant: GameParticipantFormValues): void {
  Object.assign(participant, createEmptySecondPlayerValues(), { hasSecondPlayer: true })
}

/** Ferme le bloc du 2e joueur et oublie sa saisie (aucun email ne traîne en mémoire). */
export function closeGameSecondPlayer(participant: GameParticipantFormValues): void {
  Object.assign(participant, createEmptySecondPlayerValues(), { hasSecondPlayer: false })
}

export function createDefaultGameFormValues(): GameFormValues {
  return {
    roomId: '',
    roundsCount: String(GAME_DEFAULT_ROUNDS),
    questionsPerRound: String(GAME_DEFAULT_QUESTIONS_PER_ROUND),
    // Tous les mini-jeux cochés par défaut : l'opérateur retire ce qu'il ne veut pas.
    miniGames: [...MINI_GAMES],
    participants: [createGameParticipantFormValues(1)],
    scheduled: false,
    scheduledDate: '',
    scheduledTime: '',
    durationMinutes: '',
    playersCount: '',
  }
}

export function createGameParticipantFieldErrors(): GameParticipantFieldErrors {
  return {
    podium: '',
    displayName: '',
    email: '',
    emailConsent: '',
    secondDisplayName: '',
    secondEmail: '',
    secondEmailConsent: '',
  }
}

export function createGameFieldErrors(participantsCount = 0): GameFieldErrors {
  return {
    roomId: '',
    roundsCount: '',
    questionsPerRound: '',
    miniGames: '',
    scheduledAt: '',
    durationMinutes: '',
    playersCount: '',
    participants: Array.from({ length: participantsCount }, createGameParticipantFieldErrors),
  }
}

/** Premier pupitre libre parmi ceux de la salle, ou null s'ils sont tous pris. */
export function getNextFreePodium(
  participants: GameParticipantFormValues[],
  desksCount: number = GAME_PODIUMS
): number | null {
  const usedPodiums = new Set(participants.map((participant) => Number(participant.podium)))

  return getGamePodiums(desksCount).find((podium) => !usedPodiums.has(podium)) ?? null
}

export function canAddGameParticipant(
  participants: GameParticipantFormValues[],
  desksCount: number = GAME_PODIUMS
): boolean {
  return (
    participants.length < clampDesksCount(desksCount) &&
    getNextFreePodium(participants, desksCount) !== null
  )
}

/** Une partie immédiate a au moins un participant ; une session programmée peut n'en avoir aucun. */
export function canRemoveGameParticipant(
  participants: GameParticipantFormValues[],
  scheduled = false
): boolean {
  return participants.length > (scheduled ? 0 : 1)
}

/** Seules les salles actives peuvent accueillir une partie. */
export function getActiveGameRooms(rooms: GameRoom[]): GameRoom[] {
  return rooms.filter((room) => room.status === ROOM_STATUS_ACTIVE)
}

function parseIntegerInRange(value: string, max: number, min = 1): number | null {
  const trimmed = value.trim()

  if (!/^\d+$/.test(trimmed)) {
    return null
  }

  const parsed = Number(trimmed)

  return parsed >= min && parsed <= max ? parsed : null
}

/** Règle RGPD : un email saisi exige une case de consentement cochée explicitement. */
function isConsentMissing(email: string, emailConsent: boolean): boolean {
  return !isBlank(email) && emailConsent !== true
}

/** Règle RGPD appliquée au joueur 1 d'un pupitre. */
export function isGameParticipantConsentMissing(participant: GameParticipantFormValues): boolean {
  return isConsentMissing(participant.email, participant.emailConsent)
}

/** Même règle RGPD pour le 2e joueur, seulement si son bloc est ouvert. */
export function isGameSecondPlayerConsentMissing(participant: GameParticipantFormValues): boolean {
  return (
    participant.hasSecondPlayer &&
    isConsentMissing(participant.secondEmail, participant.secondEmailConsent)
  )
}

type PlayerErrors = Pick<GameParticipantFieldErrors, 'displayName' | 'email' | 'emailConsent'>

/** Règles communes aux deux joueurs d'un pupitre : nom obligatoire, email valide + consentement. */
function validatePlayer(rawName: string, rawEmail: string, emailConsent: boolean): PlayerErrors {
  const errors: PlayerErrors = { displayName: '', email: '', emailConsent: '' }
  const displayName = rawName.trim()
  const email = rawEmail.trim()

  if (!displayName) {
    errors.displayName = 'games.form.errors.displayNameRequired'
  } else if (displayName.length > GAME_PARTICIPANT_DISPLAY_NAME_MAX_LENGTH) {
    errors.displayName = 'games.form.errors.displayNameTooLong'
  }

  if (email && (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email))) {
    errors.email = 'games.form.errors.emailInvalid'
  }

  if (isConsentMissing(email, emailConsent)) {
    errors.emailConsent = 'games.form.errors.consentRequired'
  }

  return errors
}

function validateParticipant(
  participant: GameParticipantFormValues,
  duplicatedPodiums: Set<string>,
  desksCount: number
): GameParticipantFieldErrors {
  const errors = createGameParticipantFieldErrors()

  if (parseIntegerInRange(participant.podium, clampDesksCount(desksCount)) === null) {
    errors.podium = 'games.form.errors.podiumInvalid'
  } else if (duplicatedPodiums.has(participant.podium)) {
    errors.podium = 'games.form.errors.podiumDuplicated'
  }

  Object.assign(
    errors,
    validatePlayer(participant.displayName, participant.email, participant.emailConsent)
  )

  if (participant.hasSecondPlayer) {
    const second = validatePlayer(
      participant.secondDisplayName,
      participant.secondEmail,
      participant.secondEmailConsent
    )

    errors.secondDisplayName = second.displayName
    errors.secondEmail = second.email
    errors.secondEmailConsent = second.emailConsent
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

/** Date, heure, durée et effectif d'une session programmée. */
function validateSchedule(
  form: GameFormValues,
  timeZone: string
): Pick<GameFieldErrors, 'scheduledAt' | 'durationMinutes' | 'playersCount'> {
  const errors = { scheduledAt: '', durationMinutes: '', playersCount: '' }

  if (isBlank(form.scheduledDate) || isBlank(form.scheduledTime)) {
    errors.scheduledAt = 'games.form.errors.scheduledAtRequired'
  } else if (getScheduledInstant(form, timeZone) === null) {
    errors.scheduledAt = 'games.form.errors.scheduledAtInvalid'
  }

  if (
    !isBlank(form.durationMinutes) &&
    parseIntegerInRange(form.durationMinutes, SESSION_MAX_MINUTES, SESSION_MIN_MINUTES) === null
  ) {
    errors.durationMinutes = 'games.form.errors.durationInvalid'
  }

  if (
    !isBlank(form.playersCount) &&
    parseIntegerInRange(form.playersCount, GAME_MAX_PLAYERS) === null
  ) {
    errors.playersCount = 'games.form.errors.playersCountInvalid'
  }

  return errors
}

/**
 * Valide la saisie ; chaque erreur est une clé i18n (vide = pas d'erreur). `desksCount` : pupitres
 * de la salle choisie (tous les pupitres possibles par défaut). `timeZone` : celui de la salle, dans
 * lequel se lisent le jour et l'heure d'une session programmée.
 */
export function validateGameForm(
  form: GameFormValues,
  desksCount: number = GAME_PODIUMS,
  timeZone: string = ROOM_DEFAULT_TIMEZONE
): GameFieldErrors {
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

  if (form.miniGames.length === 0) {
    errors.miniGames = 'games.form.errors.miniGamesRequired'
  }

  if (form.scheduled) {
    Object.assign(errors, validateSchedule(form, timeZone))
  }

  const duplicatedPodiums = getDuplicatedPodiums(form.participants)

  errors.participants = form.participants.map((participant) =>
    validateParticipant(participant, duplicatedPodiums, desksCount)
  )

  return errors
}

export function hasGameFormErrors(errors: GameFieldErrors): boolean {
  return (
    Boolean(
      errors.roomId ||
      errors.roundsCount ||
      errors.questionsPerRound ||
      errors.miniGames ||
      errors.scheduledAt ||
      errors.durationMinutes ||
      errors.playersCount
    ) || errors.participants.some((participant) => Object.values(participant).some(Boolean))
  )
}

function buildPlayerPayload(
  rawName: string,
  rawEmail: string,
  emailConsent: boolean,
  marketingConsent: boolean
): CreateGameSecondPlayerPayload {
  const payload: CreateGameSecondPlayerPayload = { displayName: rawName.trim() }
  const email = rawEmail.trim()

  // Sans email, rien à consentir : on n'envoie ni l'email ni les cases.
  if (email) {
    payload.email = email
    payload.emailConsent = emailConsent === true
    payload.marketingConsent = marketingConsent === true
  }

  return payload
}

function buildParticipantPayload(
  participant: GameParticipantFormValues
): CreateGameParticipantPayload {
  const payload: CreateGameParticipantPayload = {
    podium: Number(participant.podium),
    ...buildPlayerPayload(
      participant.displayName,
      participant.email,
      participant.emailConsent,
      participant.marketingConsent
    ),
  }

  // Le 2e joueur n'est envoyé que si son bloc est ouvert ; le score reste celui du pupitre.
  if (participant.hasSecondPlayer) {
    payload.secondPlayer = buildPlayerPayload(
      participant.secondDisplayName,
      participant.secondEmail,
      participant.secondEmailConsent,
      participant.secondMarketingConsent
    )
  }

  return payload
}

/**
 * Mini-jeux à envoyer, dans l'ordre de MINI_GAMES, ou `undefined` quand tous sont cochés :
 * le champ est alors omis (= « tous »), ce qui inclut d'office un futur mini-jeu.
 */
export function getSelectedMiniGames(selected: MiniGame[]): MiniGame[] | undefined {
  const ordered = MINI_GAMES.filter((miniGame) => selected.includes(miniGame))

  return ordered.length === MINI_GAMES.length ? undefined : ordered
}

/** Corps de POST /companies/:companyId/games, à n'appeler qu'après validation. */
export function buildCreateGamePayload(
  form: GameFormValues,
  timeZone: string = ROOM_DEFAULT_TIMEZONE
): CreateGamePayload {
  const payload: CreateGamePayload = {
    roomId: Number(form.roomId),
    roundsCount: Number(form.roundsCount.trim()),
    questionsPerRound: Number(form.questionsPerRound.trim()),
    participants: [...form.participants]
      .map(buildParticipantPayload)
      .sort((left, right) => left.podium - right.podium),
  }
  const miniGames = getSelectedMiniGames(form.miniGames)

  if (miniGames) {
    payload.miniGames = miniGames
  }

  const startsAt = form.scheduled ? getScheduledInstant(form, timeZone) : null

  if (startsAt) {
    payload.scheduledAt = startsAt.toISOString()

    if (!isBlank(form.durationMinutes)) {
      payload.durationMinutes = Number(form.durationMinutes.trim())
    }

    if (!isBlank(form.playersCount)) {
      payload.playersCount = Number(form.playersCount.trim())
    }
  }

  return payload
}

/**
 * Corps de PATCH d'une session programmée, à n'appeler qu'après validation. Début, durée et format ne
 * sont envoyés que s'ils ont changé : le serveur les contrôle (créneau passé, format personnalisé).
 * `participants` absent = gardés tels quels.
 */
export function buildUpdateGamePayload(
  form: GameFormValues,
  timeZone: string,
  original: Game,
  options: { includeParticipants: boolean }
): UpdateGamePayload {
  const roundsCount = Number(form.roundsCount.trim())
  const questionsPerRound = Number(form.questionsPerRound.trim())
  const startsAt = getScheduledInstant(form, timeZone)
  const payload: UpdateGamePayload = {
    roomId: Number(form.roomId),
    // Une liste complète de mini-jeux s'écrit `null` en modification (« absent » = inchangé).
    miniGames: getSelectedMiniGames(form.miniGames) ?? null,
    playersCount: isBlank(form.playersCount) ? null : Number(form.playersCount.trim()),
  }

  if (roundsCount !== original.roundsCount) {
    payload.roundsCount = roundsCount
  }

  if (questionsPerRound !== original.questionsPerRound) {
    payload.questionsPerRound = questionsPerRound
  }

  if (startsAt && startsAt.getTime() !== Date.parse(original.scheduledAt ?? '')) {
    payload.scheduledAt = startsAt.toISOString()
  }

  if (!isBlank(form.durationMinutes)) {
    const durationMinutes = Number(form.durationMinutes.trim())

    if (durationMinutes !== getGameDurationMinutes(original)) {
      payload.durationMinutes = durationMinutes
    }
  }

  if (options.includeParticipants) {
    payload.participants = [...form.participants]
      .map(buildParticipantPayload)
      .sort((left, right) => left.podium - right.podium)
  }

  return payload
}

/** Instant du jour et de l'heure saisis, lus dans le fuseau de la salle ; `null` s'ils n'existent pas. */
export function getScheduledInstant(form: GameFormValues, timeZone: string): Date | null {
  const date = form.scheduledDate.trim()
  const time = form.scheduledTime.trim()

  if (!isCalendarDate(date) || !TIME_PATTERN.test(time)) {
    return null
  }

  try {
    return zonedLocalToUtc(`${date}T${time}`, timeZone)
  } catch {
    // Un jour que le calendrier refuse (30 février) : `zonedLocalToUtc` lève.
    return null
  }
}

/** Fuseau de la salle choisie ; le fuseau par défaut sans salle choisie ou sans créneaux réglés. */
export function getGameRoomTimeZone(rooms: GameRoom[], roomId: string): string {
  return getRoomTimezone(rooms.find((room) => String(room.id) === roomId)?.schedule)
}

function getGameDurationMinutes(game: Game): number | null {
  return game.scheduledAt && game.scheduledEndAt
    ? Math.round((Date.parse(game.scheduledEndAt) - Date.parse(game.scheduledAt)) / MINUTE_MS)
    : null
}

function setScheduledInstant(form: GameFormValues, instantMs: number, timeZone: string): void {
  Object.assign(form, {
    scheduledDate: getLocalDate(instantMs, timeZone),
    scheduledTime: formatAgendaTime(instantMs, timeZone, 'en'),
  })
}

function isParticipantBlank(participant: GameParticipantFormValues): boolean {
  return (
    isBlank(participant.displayName) && isBlank(participant.email) && !participant.hasSecondPlayer
  )
}

/**
 * Bascule « Programmer pour plus tard ». Programmée, la session peut n'avoir aucun participant : la
 * ligne vierge du départ disparaît. Redevenue immédiate, elle en exige un : on en remet une.
 */
export function setGameScheduled(form: GameFormValues, scheduled: boolean): void {
  Object.assign(form, { scheduled })

  if (scheduled) {
    Object.assign(form, {
      participants: form.participants.filter((participant) => !isParticipantBlank(participant)),
    })
  } else if (form.participants.length === 0) {
    form.participants.push(createGameParticipantFormValues(1))
  }
}

/** Ce que l'adresse (`?roomId=&scheduledAt=`) préremplit ; toute autre valeur est ignorée. */
export type GamePrefill = { roomId?: number; scheduledAt?: string }

function readQueryString(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value

  return typeof raw === 'string' ? raw : undefined
}

export function parseGamePrefill(query: Record<string, unknown>): GamePrefill {
  const prefill: GamePrefill = {}
  const roomId = parseGameId(query.roomId)
  const scheduledAt = readQueryString(query.scheduledAt)

  if (roomId !== null) {
    prefill.roomId = roomId
  }

  if (
    scheduledAt !== undefined &&
    ISO_INSTANT_PATTERN.test(scheduledAt) &&
    !Number.isNaN(Date.parse(scheduledAt))
  ) {
    prefill.scheduledAt = scheduledAt
  }

  return prefill
}

/**
 * Applique le préremplissage une fois les salles connues. Une salle absente ou inactive est ignorée ;
 * sans salle choisie, l'heure n'a pas de fuseau : elle est ignorée aussi.
 */
export function applyGamePrefill(
  form: GameFormValues,
  rooms: GameRoom[],
  prefill: GamePrefill
): void {
  const room = getActiveGameRooms(rooms).find((item) => item.id === prefill.roomId)

  if (room) {
    Object.assign(form, { roomId: String(room.id) })
  }

  if (prefill.scheduledAt && form.roomId) {
    setGameScheduled(form, true)
    setScheduledInstant(
      form,
      Date.parse(prefill.scheduledAt),
      getGameRoomTimeZone(rooms, form.roomId)
    )
  }
}

function createParticipantValuesFromGame(participant: GameParticipant): GameParticipantFormValues {
  const values = createGameParticipantFormValues(participant.podium)
  const { secondPlayer } = participant

  Object.assign(values, {
    displayName: participant.displayName,
    email: participant.email ?? '',
    // Le consentement est celui déjà donné ; sans email, il n'y a rien à consentir.
    emailConsent: Boolean(participant.email) && participant.consentAt !== null,
    marketingConsent: Boolean(participant.email) && participant.marketingConsent,
  })

  if (secondPlayer) {
    Object.assign(values, {
      hasSecondPlayer: true,
      secondDisplayName: secondPlayer.displayName,
      secondEmail: secondPlayer.email ?? '',
      secondEmailConsent: Boolean(secondPlayer.email) && secondPlayer.consentAt !== null,
      secondMarketingConsent: Boolean(secondPlayer.email) && secondPlayer.marketingConsent,
    })
  }

  return values
}

/**
 * Un email masqué (rôle `user`) ne peut pas être renvoyé : remplacer les participants l'effacerait.
 * Dans ce cas ils ne se modifient pas depuis ce formulaire.
 */
export function hasMaskedParticipantEmails(game: Game): boolean {
  return (game.participants ?? []).some(
    (participant) =>
      (participant.hasEmail && participant.email === null) ||
      (participant.secondPlayer?.hasEmail === true && participant.secondPlayer.email === null)
  )
}

/** Saisie d'une session programmée existante, pour la modifier ; `timeZone` est celui de sa salle. */
export function createGameFormValuesFromGame(game: Game, timeZone: string): GameFormValues {
  const values: GameFormValues = {
    ...createDefaultGameFormValues(),
    roomId: String(game.roomId),
    roundsCount: String(game.roundsCount),
    questionsPerRound: String(game.questionsPerRound),
    miniGames: game.miniGames?.length ? [...game.miniGames] : [...MINI_GAMES],
    participants: [...(game.participants ?? [])]
      .sort((left, right) => left.podium - right.podium)
      .map(createParticipantValuesFromGame),
    scheduled: true,
    durationMinutes: String(getGameDurationMinutes(game) ?? ''),
    playersCount: game.playersCount ? String(game.playersCount) : '',
  }

  if (game.scheduledAt) {
    setScheduledInstant(values, Date.parse(game.scheduledAt), timeZone)
  }

  return values
}
