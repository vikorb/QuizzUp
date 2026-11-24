import {
  GAME_COMMAND_REFUSAL,
  type GameCommandRefusal,
  ROOM_COMMAND_RESULT,
  ROOM_COMMANDS,
  type RoomCommandMessage,
} from '@quizzup/shared'

import { readSavedBackofficeGame } from '@/game/backofficeGameMemory'
import { getLiveQuestionId } from '@/game/selectors'
import type { GameCommandResult } from '@/game/session'
import { abortGame, pauseGame, resumeGame, skipQuestion, useRoomGame } from '@/game/useRoomGame'

/**
 * Commandes à distance du personnel (US-LIVE-01) : l'écran de salle les reçoit par le flux, les
 * applique par les mêmes chemins que les boutons locaux (`useRoomGame`) ou les refuse, puis accuse.
 * La partie reste jugée ici : une commande ne fait que proposer ce qu'un bouton local ferait.
 */

/** Combien d'accusés rendus sont retenus pour reconnaître un doublon (les plus récents). */
export const REMEMBERED_COMMANDS = 50

export type RoomCommandAck =
  | { result: typeof ROOM_COMMAND_RESULT.APPLIED }
  | { result: typeof ROOM_COMMAND_RESULT.REFUSED; reason: GameCommandRefusal }

const { session, state } = useRoomGame()

// Dans l'ordre d'arrivée : `Map` garde l'ordre d'insertion, la plus ancienne sort la première.
const answered = new Map<string, RoomCommandAck>()

const isIndex = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0

/** Lit un événement `command` ; `null` si le JSON, la forme ou la commande sont inconnus. */
export function parseRoomCommand(data: string): RoomCommandMessage | null {
  let raw: Record<string, unknown>

  try {
    raw = JSON.parse(data) as Record<string, unknown>
  } catch {
    return null
  }

  const { commandId, command } = raw ?? {}

  if (
    typeof commandId !== 'string' ||
    commandId === '' ||
    !ROOM_COMMANDS.includes(command as (typeof ROOM_COMMANDS)[number])
  ) {
    return null
  }

  switch (command) {
    case 'pause':
    case 'resume':
      return { commandId, command }
    case 'skip':
      return isIndex(raw.round) && isIndex(raw.questionIndex)
        ? { commandId, command, round: raw.round, questionIndex: raw.questionIndex }
        : null
    case 'abort':
      return Number.isInteger(raw.gameId) && Number(raw.gameId) > 0
        ? { commandId, command: 'abort', gameId: Number(raw.gameId) }
        : null
    default:
      return null
  }
}

const toAck = (result: GameCommandResult): RoomCommandAck =>
  result.ok
    ? { result: ROOM_COMMAND_RESULT.APPLIED }
    : { result: ROOM_COMMAND_RESULT.REFUSED, reason: result.code }

function apply(command: RoomCommandMessage): GameCommandResult {
  if (command.command !== 'skip' && command.command !== 'abort') {
    return command.command === 'pause' ? pauseGame() : resumeGame()
  }

  const current = state.value

  if (!current || !session.value || session.value.isOver) {
    return { ok: false, code: GAME_COMMAND_REFUSAL.GAME_OVER }
  }

  if (command.command === 'skip') {
    const questionId = getLiveQuestionId(current)
    const { phase } = current

    // Même repère que le rapport d'état publié au personnel : `position` de la manche, index de la question.
    return questionId !== null &&
      phase.name === 'question' &&
      current.rounds.at(-1)?.position === command.round &&
      phase.questionIndex === command.questionIndex
      ? skipQuestion(questionId)
      : { ok: false, code: GAME_COMMAND_REFUSAL.NOT_IN_QUESTION }
  }

  // `abort` : seule la partie du backoffice jouée sur ce poste (même graine) peut être visée.
  const saved = readSavedBackofficeGame()

  if (saved?.id !== command.gameId || saved.seed !== current.setup.seed) {
    return { ok: false, code: GAME_COMMAND_REFUSAL.GAME_OVER }
  }

  abortGame()
  return { ok: true }
}

/** Applique la commande, ou renvoie l'accusé déjà rendu si ce `commandId` a déjà été traité. */
export function answerRoomCommand(command: RoomCommandMessage): RoomCommandAck {
  const known = answered.get(command.commandId)

  if (known) {
    return known
  }

  const ack = toAck(apply(command))

  answered.set(command.commandId, ack)

  if (answered.size > REMEMBERED_COMMANDS) {
    answered.delete(answered.keys().next().value as string)
  }

  return ack
}

export function resetRoomCommands(): void {
  answered.clear()
}
