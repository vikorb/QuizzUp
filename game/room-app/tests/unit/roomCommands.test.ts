import { DEFAULT_GAME_TIMINGS } from '@quizzup/game-engine'
import { GAME_COMMAND_REFUSAL, MINI_GAME_FLASH_BLIND_TEST } from '@quizzup/shared'
import { nextTick } from 'vue'

import { createSilentExtractPlayer, type ExtractPlayer } from '@/audio/player'
import { rememberBackofficeGameId } from '@/game/backofficeGameMemory'
import { createMemorySessionStorage } from '@/game/session'
import {
  closeGame,
  configureRoomGame,
  pressBuzzer,
  startNewGame,
  useRoomGame,
} from '@/game/useRoomGame'
import {
  answerRoomCommand,
  parseRoomCommand,
  REMEMBERED_COMMANDS,
  resetRoomCommands,
} from '@/live/roomCommands'
import { startRoomLive, stopRoomLive, useRoomLive } from '@/live/roomLive'
import { syncRoomAuth } from '@/state/roomAuth'
import { setDemoMode, setRoomToken } from '@/utils/auth'

import { createFakeLiveServer, helloMessage } from '../_helpers/fakeLiveServer'
import { createManualClock, getPlayableThemes, REGISTRATIONS } from '../_helpers/fixtures'

const GAME_ID = 12
const SEED = 7

let server: ReturnType<typeof createFakeLiveServer>
let clock: ReturnType<typeof createManualClock>
let player: ExtractPlayer

async function settle(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
  await nextTick()
  await vi.advanceTimersByTimeAsync(0)
}

/** Ouvre le flux de la salle (avec son `hello` sauf demande contraire). */
async function connect(withHello = true): Promise<void> {
  startRoomLive(() => 'play')
  await settle()
  if (withHello) {
    server.streams.at(-1)?.push(helloMessage())
    await settle()
  }
}

/** Le personnel envoie une commande : elle arrive sur le flux, la salle accuse. */
async function send(command: Record<string, unknown> | string): Promise<void> {
  const data = typeof command === 'string' ? command : JSON.stringify(command)

  server.streams.at(-1)?.push(`event: command\ndata: ${data}\n\n`)
  await settle()
}

const lastAck = () => server.acks.at(-1)

/** Partie de blind test amenée à la 1re question, reliée à la partie `GAME_ID` du backoffice. */
function startQuestion(): void {
  const { state } = useRoomGame()

  startNewGame({
    registrations: REGISTRATIONS,
    themes: getPlayableThemes(),
    seed: SEED,
    miniGames: [MINI_GAME_FLASH_BLIND_TEST],
  })
  rememberBackofficeGameId(GAME_ID, SEED)
  clock.advance(DEFAULT_GAME_TIMINGS.roundIntroMs + 10)
  vi.advanceTimersByTime(50)
  const chooser = state.value?.rounds[0]?.chooserParticipantId as 1 | 2 | 3

  pressBuzzer({ desk: chooser, button: 'A', buttonIndex: 0, at: clock.value, code: 'test' })
  expect(state.value?.phase.name).toBe('question')
}

/** Repère de la question en cours, tel que le personnel le lit dans le rapport d'état. */
function target() {
  const { state } = useRoomGame()
  const phase = state.value?.phase

  return {
    round: state.value?.rounds.at(-1)?.position ?? -1,
    questionIndex: phase?.name === 'question' ? phase.questionIndex : -1,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  setRoomToken('jeton-salle')
  setDemoMode(false)
  syncRoomAuth()
  server = createFakeLiveServer()
  vi.stubGlobal('fetch', server.fetchMock)
  clock = createManualClock()
  player = { ...createSilentExtractPlayer(), pause: vi.fn(() => 0), resume: vi.fn() }
  configureRoomGame({ storage: createMemorySessionStorage(), player, now: clock.now })
})

afterEach(() => {
  stopRoomLive()
  closeGame()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  localStorage.clear()
  syncRoomAuth()
})

describe('commandes à distance : application', () => {
  it('pause puis resume : la partie se fige et reprend, chaque commande est accusée', async () => {
    const { paused } = useRoomGame()

    await connect()
    startQuestion()

    await send({ commandId: 'c1', command: 'pause' })
    expect(paused.value).toBe(true)
    expect(player.pause).toHaveBeenCalledTimes(1)
    expect(lastAck()).toEqual({ commandId: 'c1', body: { result: 'applied' } })

    await send({ commandId: 'c2', command: 'resume' })
    expect(paused.value).toBe(false)
    expect(lastAck()).toEqual({ commandId: 'c2', body: { result: 'applied' } })
    expect(server.fetchMock.mock.calls.at(-1)?.[1]?.method).toBe('POST')
    expect(new Headers(server.fetchMock.mock.calls.at(-1)?.[1]?.headers).get('Authorization')).toBe(
      'Bearer jeton-salle'
    )
  })

  it('refuse pause et resume sans partie (game_over), resume hors pause (not_paused), pause en double (already_paused)', async () => {
    await connect()

    await send({ commandId: 'a', command: 'pause' })
    expect(lastAck()?.body).toEqual({ result: 'refused', reason: GAME_COMMAND_REFUSAL.GAME_OVER })
    await send({ commandId: 'b', command: 'resume' })
    expect(lastAck()?.body).toEqual({ result: 'refused', reason: GAME_COMMAND_REFUSAL.GAME_OVER })

    startQuestion()
    await send({ commandId: 'c', command: 'resume' })
    expect(lastAck()?.body).toEqual({ result: 'refused', reason: GAME_COMMAND_REFUSAL.NOT_PAUSED })

    await send({ commandId: 'd', command: 'pause' })
    await send({ commandId: 'e', command: 'pause' })
    expect(lastAck()?.body).toEqual({
      result: 'refused',
      reason: GAME_COMMAND_REFUSAL.ALREADY_PAUSED,
    })
  })

  it('skip : passe la question visée', async () => {
    const { state } = useRoomGame()

    await connect()
    startQuestion()

    await send({ commandId: 's1', command: 'skip', ...target() })

    expect(lastAck()?.body).toEqual({ result: 'applied' })
    expect(state.value?.phase.name).toBe('reveal')
  })

  it('skip : refusé not_in_question si la manche ou la question ne sont plus les bonnes', async () => {
    const { state } = useRoomGame()

    await connect()
    startQuestion()
    const { round, questionIndex } = target()

    await send({ commandId: 's1', command: 'skip', round, questionIndex: questionIndex + 1 })
    expect(lastAck()?.body).toEqual({
      result: 'refused',
      reason: GAME_COMMAND_REFUSAL.NOT_IN_QUESTION,
    })

    await send({ commandId: 's2', command: 'skip', round: round + 1, questionIndex })
    expect(lastAck()?.body).toEqual({
      result: 'refused',
      reason: GAME_COMMAND_REFUSAL.NOT_IN_QUESTION,
    })
    expect(state.value?.phase.name).toBe('question')
  })

  it('skip : refusé paused en pause, game_over sans partie', async () => {
    await connect()

    await send({ commandId: 's0', command: 'skip', round: 1, questionIndex: 0 })
    expect(lastAck()?.body).toEqual({ result: 'refused', reason: GAME_COMMAND_REFUSAL.GAME_OVER })

    startQuestion()
    await send({ commandId: 's1', command: 'pause' })
    await send({ commandId: 's2', command: 'skip', ...target() })
    expect(lastAck()?.body).toEqual({ result: 'refused', reason: GAME_COMMAND_REFUSAL.PAUSED })
  })

  it('skip : refusé hors question (écran de manche)', async () => {
    const { state } = useRoomGame()

    await connect()
    startNewGame({
      registrations: REGISTRATIONS,
      themes: getPlayableThemes(),
      seed: SEED,
      miniGames: [MINI_GAME_FLASH_BLIND_TEST],
    })
    expect(state.value?.phase.name).not.toBe('question')

    await send({ commandId: 's1', command: 'skip', round: 1, questionIndex: 0 })
    expect(lastAck()?.body).toEqual({
      result: 'refused',
      reason: GAME_COMMAND_REFUSAL.NOT_IN_QUESTION,
    })
  })

  it('abort : arrête la partie du backoffice jouée sur ce poste', async () => {
    const { state } = useRoomGame()

    await connect()
    startQuestion()

    await send({ commandId: 'x1', command: 'abort', gameId: GAME_ID })

    expect(lastAck()?.body).toEqual({ result: 'applied' })
    expect(state.value?.phase.name).toBe('aborted')
  })

  it('abort : refusé si gameId est une autre partie, la partie continue', async () => {
    const { state } = useRoomGame()

    await connect()
    startQuestion()

    await send({ commandId: 'x1', command: 'abort', gameId: GAME_ID + 1 })

    expect(lastAck()?.body).toEqual({ result: 'refused', reason: GAME_COMMAND_REFUSAL.GAME_OVER })
    expect(state.value?.phase.name).toBe('question')
  })

  it('abort : refusé si la partie jouée n’est pas celle du backoffice (autre graine) ou terminée', async () => {
    const { state } = useRoomGame()

    await connect()
    startQuestion()
    rememberBackofficeGameId(GAME_ID, SEED + 1)

    await send({ commandId: 'x1', command: 'abort', gameId: GAME_ID })
    expect(lastAck()?.body).toEqual({ result: 'refused', reason: GAME_COMMAND_REFUSAL.GAME_OVER })
    expect(state.value?.phase.name).toBe('question')

    rememberBackofficeGameId(GAME_ID, SEED)
    await send({ commandId: 'x2', command: 'abort', gameId: GAME_ID })
    await send({ commandId: 'x3', command: 'abort', gameId: GAME_ID })
    expect(lastAck()).toEqual({
      commandId: 'x3',
      body: { result: 'refused', reason: GAME_COMMAND_REFUSAL.GAME_OVER },
    })
  })
})

describe('commandes à distance : réception', () => {
  it('une commande déjà traitée n’est pas rejouée : l’accusé rendu est renvoyé', async () => {
    const { paused } = useRoomGame()

    await connect()
    startQuestion()

    await send({ commandId: 'c1', command: 'pause' })
    await send({ commandId: 'c2', command: 'resume' })
    await send({ commandId: 'c1', command: 'pause' })

    expect(paused.value).toBe(false)
    expect(server.acks).toHaveLength(3)
    expect(server.acks[2]).toEqual(server.acks[0])
  })

  it('ignore une commande inconnue ou mal formée sans couper le flux', async () => {
    const { paused } = useRoomGame()

    await connect()
    startQuestion()

    for (const bad of [
      'pas du json',
      'null',
      '[]',
      { command: 'pause' },
      { commandId: '', command: 'pause' },
      { commandId: 'x', command: 'explode' },
      { commandId: 'x', command: 'skip', round: 1 },
      { commandId: 'x', command: 'skip', round: -1, questionIndex: 0 },
      { commandId: 'x', command: 'abort' },
      { commandId: 'x', command: 'abort', gameId: 0 },
    ]) {
      await send(bad)
    }

    expect(server.acks).toHaveLength(0)
    expect(server.streams).toHaveLength(1)
    expect(server.streams[0]?.aborted).toBe(false)

    await send({ commandId: 'ok', command: 'pause' })
    expect(paused.value).toBe(true)
    expect(lastAck()?.commandId).toBe('ok')
  })

  it('n’applique rien tant que le flux n’a pas confirmé la session (pas de hello)', async () => {
    const { paused } = useRoomGame()

    await connect(false)
    startQuestion()
    await send({ commandId: 'c1', command: 'pause' })

    expect(paused.value).toBe(false)
    expect(server.acks).toHaveLength(0)
  })

  it('n’applique rien une fois la session de salle terminée', async () => {
    const { paused } = useRoomGame()

    await connect()
    startQuestion()

    // La fin de session et une commande arrivent dans le même morceau du flux.
    server.streams[0]?.push(
      'event: session_ended\ndata: {}\n\nevent: command\ndata: {"commandId":"c1","command":"pause"}\n\n'
    )
    await settle()

    expect(paused.value).toBe(false)
    expect(server.acks).toHaveLength(0)
  })
})

describe('commandes à distance : accusé', () => {
  it('un accusé en échec réseau ne casse ni la partie ni le flux', async () => {
    const { paused, state } = useRoomGame()

    await connect()
    startQuestion()
    server.setAckReply('network-error')

    await send({ commandId: 'c1', command: 'pause' })
    expect(paused.value).toBe(true)
    expect(server.acks).toHaveLength(1)
    expect(server.streams[0]?.aborted).toBe(false)
    expect(state.value?.phase.name).toBe('question')

    server.setAckReply({ status: 204 })
    await send({ commandId: 'c2', command: 'resume' })
    expect(paused.value).toBe(false)
    expect(lastAck()?.commandId).toBe('c2')
  })

  it('un refus serveur de l’accusé (404) est sans suite', async () => {
    const { paused } = useRoomGame()

    await connect()
    startQuestion()
    server.setAckReply({ status: 404 })

    await send({ commandId: 'c1', command: 'pause' })

    expect(paused.value).toBe(true)
    expect(useRoomLive().sessionEnded.value).toBe(false)
  })

  it('un 401 sur l’accusé met fin à la session, la partie en cours continue', async () => {
    const { state } = useRoomGame()

    await connect()
    startQuestion()
    server.setAckReply({ status: 401 })

    await send({ commandId: 'c1', command: 'pause' })

    expect(useRoomLive().sessionEnded.value).toBe(true)
    expect(state.value?.phase.name).toBe('question')
  })
})

describe('commandes à distance : mémoire des accusés', () => {
  beforeEach(() => {
    resetRoomCommands()
    setDemoMode(true)
  })

  it('analyse une commande valide de chaque forme', () => {
    expect(parseRoomCommand('{"commandId":"a","command":"pause","extra":1}')).toEqual({
      commandId: 'a',
      command: 'pause',
    })
    expect(
      parseRoomCommand('{"commandId":"a","command":"skip","round":2,"questionIndex":0}')
    ).toEqual({ commandId: 'a', command: 'skip', round: 2, questionIndex: 0 })
    expect(parseRoomCommand('{"commandId":"a","command":"abort","gameId":9}')).toEqual({
      commandId: 'a',
      command: 'abort',
      gameId: 9,
    })
  })

  it(`ne retient que les ${REMEMBERED_COMMANDS} derniers identifiants`, () => {
    const first = { commandId: 'first', command: 'resume' } as const

    expect(answerRoomCommand(first)).toEqual({ result: 'refused', reason: 'game_over' })
    startQuestion()
    // Encore retenu : l'accusé d'avant la partie est renvoyé, la commande n'est pas rejouée.
    expect(answerRoomCommand(first)).toEqual({ result: 'refused', reason: 'game_over' })

    for (let index = 0; index < REMEMBERED_COMMANDS; index += 1) {
      answerRoomCommand({ commandId: `other-${index}`, command: 'resume' })
    }

    // Oublié : la commande est examinée de nouveau, à la lumière de la partie en cours.
    expect(answerRoomCommand(first)).toEqual({ result: 'refused', reason: 'not_paused' })
  })
})
