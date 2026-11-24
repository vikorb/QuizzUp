// ponytail: tout vit dans la mémoire de ce processus, donc une seule instance du backend. Dès qu'il y
// en a deux, un rapport reçu par l'une n'atteint pas les flux ouverts sur l'autre : passer à
// PostgreSQL LISTEN/NOTIFY (ou à un bus équivalent) avant de déployer une deuxième instance.
import { randomUUID } from 'node:crypto'

import {
  GAME_IDLE_PHASES,
  LIVE_EVENT,
  LIVE_OFFLINE_AFTER_MS,
  ROOM_COMMAND_RESULT,
  ROOM_COMMAND_TIMEOUT_MS,
  ROOM_PRESENCE,
  type GameCommandRefusal,
  type LiveEvent,
  type RoomCommand,
  type RoomCommandName,
  type RoomCommandResultMessage,
  type RoomLive,
  type RoomPresence,
  type RoomStatusReport,
} from '@quizzup/shared'

/** Un flux ouvert vu du hub : il reçoit des événements et peut être fermé par le hub. */
export type LiveSink = {
  send: (event: LiveEvent, data: unknown) => void
  close: () => void
}

/** Flux du personnel ouverts en même temps par un même compte. */
export const LIVE_MAX_STREAMS_PER_ACCOUNT = 5

/**
 * Commandes gardées en mémoire en même temps pour une salle, accusées comprises (dédoublonnage).
 * `abort` n'est jamais compté ni refusé : l'arrêt d'une partie ne doit pas dépendre de cette limite.
 */
export const COMMAND_MAX_PER_ROOM = 10

const SWEEP_EVERY_MS = 15_000

type RoomEntry = {
  companyId: number
  report: RoomStatusReport | null
  lastSeenAt: number | null
  stream: { id: string; sink: LiveSink } | null
  /** Présence diffusée en dernier : le balayage ne diffuse que si elle change. */
  announced: RoomPresence
}

type StaffSubscription = { accountId: number; sink: LiveSink }

/** Une commande relayée : gardée jusqu'à l'expiration, accusée ou non, pour ignorer un doublon. */
type PendingCommand = {
  companyId: number
  roomId: number
  command: RoomCommandName
  /** Contenu de la commande : un même identifiant avec un autre contenu est un conflit. */
  fingerprint: string
  settled: boolean
  timer: NodeJS.Timeout
}

export type SendCommandOutcome = 'sent' | 'duplicate' | 'conflict' | 'not_controllable' | 'too_many'

const fingerprintOf = (command: RoomCommand): string =>
  JSON.stringify([
    command.command,
    'round' in command ? command.round : null,
    'questionIndex' in command ? command.questionIndex : null,
    'gameId' in command ? command.gameId : null,
  ])

export type CommandAck =
  | { result: typeof ROOM_COMMAND_RESULT.APPLIED }
  | { result: typeof ROOM_COMMAND_RESULT.REFUSED; reason: GameCommandRefusal }

export function createLiveHub({ now = Date.now }: { now?: () => number } = {}) {
  const rooms = new Map<number, RoomEntry>()
  const staff = new Map<number, Set<StaffSubscription>>()
  // Clé `roomId:commandId` : l'accusé d'une autre salle ne retrouve jamais la commande.
  const commands = new Map<string, PendingCommand>()

  const commandKey = (roomId: number, commandId: string) => `${roomId}:${commandId}`

  function presenceOf(entry: RoomEntry): RoomPresence {
    if (entry.lastSeenAt === null || now() - entry.lastSeenAt >= LIVE_OFFLINE_AFTER_MS) {
      return ROOM_PRESENCE.OFFLINE
    }

    const { gameId, phase } = entry.report ?? { gameId: null, phase: null }

    return gameId !== null && !GAME_IDLE_PHASES.some((idle) => idle === phase)
      ? ROOM_PRESENCE.IN_GAME
      : ROOM_PRESENCE.ONLINE
  }

  function toLive(roomId: number, entry: RoomEntry | undefined): RoomLive {
    if (!entry) {
      return {
        roomId,
        presence: ROOM_PRESENCE.OFFLINE,
        controllable: false,
        lastSeenAt: null,
        status: null,
      }
    }

    const presence = presenceOf(entry)

    return {
      roomId,
      presence,
      controllable: presence !== ROOM_PRESENCE.OFFLINE && entry.stream !== null,
      lastSeenAt: entry.lastSeenAt === null ? null : new Date(entry.lastSeenAt).toISOString(),
      status: entry.report,
    }
  }

  function broadcast(roomId: number, entry: RoomEntry): void {
    const live = toLive(roomId, entry)

    entry.announced = live.presence
    staff.get(entry.companyId)?.forEach(({ sink }) => sink.send(LIVE_EVENT.ROOM_STATUS, live))
  }

  function entryFor(roomId: number, companyId: number): RoomEntry {
    let entry = rooms.get(roomId)

    if (!entry) {
      entry = {
        companyId,
        report: null,
        lastSeenAt: null,
        stream: null,
        announced: ROOM_PRESENCE.OFFLINE,
      }
      rooms.set(roomId, entry)
    }

    return entry
  }

  // Une entrée par salle (créée par un compte de salle authentifié), jamais retirée : elle garde le
  // dernier rapport et `lastSeenAt` d'une salle hors ligne pour l'afficher au personnel.
  function sweep(): void {
    rooms.forEach((entry, roomId) => {
      if (presenceOf(entry) !== entry.announced) {
        broadcast(roomId, entry)
      }
    })
  }

  function sendToStaff(companyId: number, message: RoomCommandResultMessage): void {
    staff.get(companyId)?.forEach(({ sink }) => sink.send(LIVE_EVENT.COMMAND_RESULT, message))
  }

  const timer = setInterval(sweep, SWEEP_EVERY_MS)
  timer.unref()

  return {
    /** État courant d'une salle ; hors ligne si elle n'a jamais rien envoyé. */
    roomLive: (roomId: number): RoomLive => toLive(roomId, rooms.get(roomId)),

    /** Ouvre le flux d'une salle : un flux déjà ouvert reçoit `replaced` puis est fermé. */
    openRoomStream(roomId: number, companyId: number, sink: LiveSink): string {
      const entry = entryFor(roomId, companyId)
      const previous = entry.stream
      const id = randomUUID()

      entry.stream = { id, sink }
      previous?.sink.send(LIVE_EVENT.REPLACED, {})
      previous?.sink.close()
      broadcast(roomId, entry)

      return id
    },

    /** Sans effet si ce flux n'est plus le flux courant (remplacé entre-temps). */
    closeRoomStream(roomId: number, streamId: string): void {
      const entry = rooms.get(roomId)

      if (entry?.stream?.id === streamId) {
        entry.stream = null
        broadcast(roomId, entry)
      }
    },

    /** Vrai seulement si un autre flux est ouvert pour la salle ; sans flux ouvert, rien n'est remplacé. */
    isReplaced(roomId: number, streamId: string): boolean {
      const current = rooms.get(roomId)?.stream

      return current !== null && current !== undefined && current.id !== streamId
    },

    report(roomId: number, companyId: number, report: RoomStatusReport): void {
      const entry = entryFor(roomId, companyId)

      entry.report = report
      entry.lastSeenAt = now()
      broadcast(roomId, entry)
    },

    /**
     * Prévient de la modification d'une partie : le flux de la salle (si elle est de cette
     * compagnie) et le personnel de cette compagnie, personne d'autre. Rien de plus que l'identifiant :
     * les clients relisent la partie par la route habituelle.
     */
    gameUpdated(companyId: number, roomId: number, gameId: number): void {
      const entry = rooms.get(roomId)

      if (entry?.companyId === companyId) {
        entry.stream?.sink.send(LIVE_EVENT.GAME_UPDATED, { gameId })
      }

      staff.get(companyId)?.forEach(({ sink }) => sink.send(LIVE_EVENT.GAME_UPDATED, { gameId }))
    },

    /** Abonne le flux d'un membre du personnel aux salles de sa compagnie. */
    subscribeStaff(companyId: number, accountId: number, sink: LiveSink): () => void {
      const subscription = { accountId, sink }
      const set = staff.get(companyId) ?? new Set<StaffSubscription>()

      set.add(subscription)
      staff.set(companyId, set)

      return () => {
        set.delete(subscription)

        if (set.size === 0 && staff.get(companyId) === set) {
          staff.delete(companyId)
        }
      }
    },

    staffStreamCount(accountId: number): number {
      let count = 0

      staff.forEach((set) => set.forEach((sub) => (count += sub.accountId === accountId ? 1 : 0)))

      return count
    },

    /**
     * Relaie une commande au flux de la salle. Refusée si la salle n'est pas pilotable ou n'est pas
     * celle de cette compagnie ; un identifiant déjà vu pour cette salle n'est pas relayé deux fois
     * (`duplicate`, ou `conflict` si son contenu diffère). Sans accusé au bout de
     * `ROOM_COMMAND_TIMEOUT_MS`, le personnel reçoit `expired`.
     */
    sendCommand(
      roomId: number,
      companyId: number,
      commandId: string,
      command: RoomCommand
    ): SendCommandOutcome {
      const key = commandKey(roomId, commandId)
      const entry = rooms.get(roomId)

      const fingerprint = fingerprintOf(command)
      const known = commands.get(key)

      if (known) {
        return known.fingerprint === fingerprint ? 'duplicate' : 'conflict'
      }

      if (!entry?.stream || entry.companyId !== companyId || !toLive(roomId, entry).controllable) {
        return 'not_controllable'
      }

      const kept = [...commands.values()].filter(
        (item) => item.roomId === roomId && item.command !== 'abort'
      ).length

      if (command.command !== 'abort' && kept >= COMMAND_MAX_PER_ROOM) {
        return 'too_many'
      }

      const timer = setTimeout(() => {
        const pending = commands.get(key)

        commands.delete(key)

        if (pending && !pending.settled) {
          sendToStaff(pending.companyId, {
            commandId,
            roomId,
            command: pending.command,
            result: ROOM_COMMAND_RESULT.EXPIRED,
          })
        }
      }, ROOM_COMMAND_TIMEOUT_MS)

      timer.unref()
      commands.set(key, {
        companyId,
        roomId,
        command: command.command,
        fingerprint,
        settled: false,
        timer,
      })
      entry.stream.sink.send(LIVE_EVENT.COMMAND, { commandId, ...command })

      return 'sent'
    },

    /**
     * Enregistre l'accusé d'une salle et le transmet au personnel de sa compagnie. Faux si la
     * commande est inconnue, expirée, déjà accusée ou destinée à une autre salle.
     */
    settleCommand(roomId: number, commandId: string, ack: CommandAck): boolean {
      const pending = commands.get(commandKey(roomId, commandId))

      if (!pending || pending.settled) {
        return false
      }

      pending.settled = true
      sendToStaff(pending.companyId, {
        commandId,
        roomId,
        command: pending.command,
        ...ack,
      })

      return true
    },

    /** Commandes encore en mémoire (en attente d'accusé ou gardées pour le dédoublonnage). */
    pendingCommandCount: (): number => commands.size,

    sweep,

    /** Arrête le balayage et ferme tous les flux (fermeture de l'application). */
    close(): void {
      clearInterval(timer)
      commands.forEach((pending) => clearTimeout(pending.timer))
      commands.clear()
      const sinks = [
        ...[...rooms.values()].flatMap((entry) => (entry.stream ? [entry.stream.sink] : [])),
        ...[...staff.values()].flatMap((set) => [...set].map((sub) => sub.sink)),
      ]

      sinks.forEach((sink) => sink.close())
      rooms.clear()
      staff.clear()
    },
  }
}

export type LiveHub = ReturnType<typeof createLiveHub>
