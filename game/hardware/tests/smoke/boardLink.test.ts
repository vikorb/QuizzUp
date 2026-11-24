import { WATCHDOG_STALL_MS } from '@hardware/lighting/lightingController'
import { SMOKE_HARD_LIMITS } from '@hardware/lighting/smoke'
import type { SmokeBoardState, SmokeBoardStatus } from '@hardware/smoke/boardLink'
import {
  BOARD_BANNER_TIMEOUT_MS,
  BOARD_FIRE_INTERVAL_MS,
  BOARD_PRESENCE_MS,
  BOARD_SILENCE_MS,
  createSmokeBoardLink,
} from '@hardware/smoke/boardLink'

import type { FakeSmokeBoardOptions } from '../_helpers/fakeSmokeBoard'
import {
  advance,
  createFakeSmokeBoard,
  FAKE_BOARD_BANNER,
  FAKE_BOARD_VERSION,
  flush,
} from '../_helpers/fakeSmokeBoard'
import { createManualClock } from '../_helpers/manualClock'

async function setup(options: Partial<FakeSmokeBoardOptions> = {}) {
  const clock = createManualClock()
  const board = createFakeSmokeBoard({ clock, ...options })
  const link = createSmokeBoardLink({ port: board.port, clock })
  const states: SmokeBoardState[] = []
  link.onChange((state) => states.push(state))
  const opening = link.open()
  await advance(clock, 1000)
  return { clock, board, link, states, opening }
}

/** Bannière reçue, carte juste remise à zéro : encore dans les 5 s de pause du démarrage. */
async function cold(options: Partial<FakeSmokeBoardOptions> = {}) {
  const context = await setup(options)
  expect(await context.opening).toBe('ready')
  return context
}

/** Carte prête à lancer un jet : pause de démarrage écoulée et phase `ready` lue par le lien. */
async function ready(options: Partial<FakeSmokeBoardOptions> = {}, warm = true) {
  const context = await cold(options)
  if (warm) {
    await advance(context.clock, 4500)
    expect(context.link.getState().phase).toBe('ready')
  }
  return context
}

const sent = (board: ReturnType<typeof createFakeSmokeBoard>, line: string) =>
  board.received.filter((entry) => entry.line === line)

describe('ouverture et bannière', () => {
  it('ouvre à 9600 bauds, 8N1, et passe prête sur une bannière valide', async () => {
    const { board, link, opening } = await setup()
    expect(await opening).toBe('ready')
    expect(board.port.openedWith).toEqual({
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
    })
    expect(link.getState()).toEqual({
      status: 'ready',
      problem: null,
      version: FAKE_BOARD_VERSION,
      // Première réponse de la carte à notre H : elle est en pause après sa remise à zéro.
      board: { output: false, state: 'COOL', cause: 'CMD' },
      phase: 'cool',
    })
    expect(board.received.map((entry) => entry.line)).toEqual(['H'])
  })

  it('ne parle pas à la carte avant la bannière', async () => {
    const clock = createManualClock()
    const board = createFakeSmokeBoard({ clock })
    const link = createSmokeBoardLink({ port: board.port, clock })
    void link.open()
    await advance(clock, 900)
    link.drive(true)
    link.drive(false)
    await advance(clock, 50)
    expect(link.getState().status).toBe('connecting')
    expect(board.received).toEqual([])
  })

  it('attend la bannière 3 s : sans elle, programme absent et aucun F', async () => {
    const { clock, board, link, opening } = await setup({ banner: null })
    expect(link.getState().status).toBe('connecting')
    await advance(clock, BOARD_BANNER_TIMEOUT_MS - 1000 - 50)
    expect(link.getState().status).toBe('connecting')
    await advance(clock, 100)
    expect(await opening).toBe('no_firmware')
    expect(link.getState()).toMatchObject({ status: 'no_firmware', problem: 'no_banner' })
    link.drive(true)
    await advance(clock, 1000)
    expect(board.received).toEqual([])
  })

  it('refuse la bannière d’un autre protocole tout de suite', async () => {
    const { board, link, opening } = await setup({ banner: 'QZF READY 2 1.0.0 10000 5000 500' })
    expect(await opening).toBe('no_firmware')
    expect(link.getState()).toMatchObject({ problem: 'other_protocol', version: null })
    link.drive(true)
    expect(board.received).toEqual([])
  })

  it.each([
    ['plafond plus long', `QZF READY 1 1.0.0 ${SMOKE_HARD_LIMITS.maxDurationMs + 1} 5000 500`],
    ['pause plus courte', `QZF READY 1 1.0.0 10000 ${SMOKE_HARD_LIMITS.minCooldownMs - 1} 500`],
    ['bail plus long', `QZF READY 1 1.0.0 10000 5000 ${WATCHDOG_STALL_MS + 1}`],
  ])('refuse une carte plus permissive : %s', async (_name, banner) => {
    const { board, link, opening } = await setup({ banner })
    expect(await opening).toBe('no_firmware')
    expect(link.getState().problem).toBe('too_permissive')
    link.drive(true)
    expect(board.received).toEqual([])
  })

  it('refuse des valeurs illisibles', async () => {
    const { link, opening } = await setup({ banner: 'QZF READY 1 1.0.0 dix 5000 500' })
    expect(await opening).toBe('no_firmware')
    expect(link.getState().problem).toBe('invalid_values')
  })

  it('continue d’attendre après une ligne qui n’est pas une bannière', async () => {
    const { clock, board, link, opening } = await setup({ banner: null })
    board.inject('bruit\n')
    await advance(clock, 100)
    expect(link.getState().status).toBe('connecting')
    board.inject(`${FAKE_BOARD_BANNER}\n`)
    expect(await opening).toBe('ready')
  })

  it('tolère des octets parasites collés avant la bannière', async () => {
    const { opening } = await setup({ noise: '\u0000þ\u0000' })
    expect(await opening).toBe('ready')
  })

  it('rend l’état courant si open est rappelé', async () => {
    const { link, opening } = await setup()
    await opening
    expect(await link.open()).toBe('ready')
  })
})

describe('drive : ordres F et 0', () => {
  it('envoie F quand la fumée doit sortir', async () => {
    const { board, link } = await ready()
    link.drive(true)
    await flush()
    expect(sent(board, 'F')).toHaveLength(1)
    expect(board.snapshot()).toMatchObject({ output: true, state: 'FIRE' })
    expect(link.getState().board).toEqual({ output: true, state: 'FIRE', cause: 'CMD' })
  })

  it('ne renouvelle jamais F de lui-même : sans nouvel appel, la carte coupe au bout du bail', async () => {
    const { clock, board, link } = await ready()
    link.drive(true)
    await advance(clock, 5000)
    expect(sent(board, 'F')).toHaveLength(1)
    const { lastCutAt, cause, output } = board.snapshot()
    expect(output).toBe(false)
    expect(cause).toBe('LEASE')
    expect(lastCutAt).toBe(
      board.received.find((entry) => entry.line === 'F')!.at + WATCHDOG_STALL_MS
    )
  })

  it('envoie 0 une fois au changement, pas à chaque appel', async () => {
    const { board, link } = await ready()
    link.drive(false)
    link.drive(false)
    await flush()
    expect(sent(board, '0')).toHaveLength(0)
    link.drive(true)
    link.drive(false)
    link.drive(false)
    link.drive(false)
    await flush()
    expect(sent(board, '0')).toHaveLength(1)
    expect(board.snapshot().output).toBe(false)
    expect(board.snapshot().cause).toBe('CMD')
  })

  it('envoie 0 tout de suite, sans attendre les 100 ms entre deux F', async () => {
    const { clock, board, link } = await ready()
    link.drive(true)
    await advance(clock, 25)
    link.drive(false)
    await flush()
    expect(board.received.filter((entry) => entry.line !== 'H').map((entry) => entry.line)).toEqual(
      ['F', '0']
    )
    expect(board.received.at(-1)!.at - board.received.find((entry) => entry.line === 'F')!.at).toBe(
      25
    )
  })

  it('borne la cadence : un F au plus toutes les 100 ms pour 40 appels par seconde', async () => {
    const { clock, board, link } = await ready()
    await advance(clock, 2000, 25, () => link.drive(true))
    const fires = sent(board, 'F')
    // 2 s à 40 Hz : 80 appels, au plus un F toutes les 100 ms.
    expect(fires).toHaveLength(20)
    for (let index = 1; index < fires.length; index += 1) {
      expect(fires[index]!.at - fires[index - 1]!.at).toBeGreaterThanOrEqual(BOARD_FIRE_INTERVAL_MS)
    }
  })

  it('rate-limite aussi un rythme plus lent que 100 ms sans trou de plus d’un bail', async () => {
    const { clock, board, link } = await ready()
    await advance(clock, 1000, 33, () => link.drive(true))
    const fires = sent(board, 'F')
    for (let index = 1; index < fires.length; index += 1) {
      const gap = fires[index]!.at - fires[index - 1]!.at
      expect(gap).toBeGreaterThanOrEqual(BOARD_FIRE_INTERVAL_MS)
      expect(gap).toBeLessThan(WATCHDOG_STALL_MS)
    }
  })

  it('40 appels par seconde pendant 12 s : la carte coupe à 10 s (MAX) et le lien le rapporte', async () => {
    const { clock, board, link, states } = await ready()
    const startedAt = clock.now()
    await advance(clock, 12_000, 25, () => link.drive(true))
    const { lastCutAt, cause, output } = board.snapshot()
    expect(output).toBe(false)
    expect(cause).toBe('MAX')
    const firstFire = board.received.find((entry) => entry.line === 'F')!.at
    expect(firstFire - startedAt).toBeLessThan(BOARD_FIRE_INTERVAL_MS)
    expect(lastCutAt).toBe(firstFire + SMOKE_HARD_LIMITS.maxDurationMs)
    // Le lien l'a vu passer : sortie coupée, pause en cours, cause plafond.
    expect(states.some((state) => state.board?.cause === 'MAX' && !state.board.output)).toBe(true)
    expect(link.getState().board).toEqual({ output: false, state: 'COOL', cause: 'MAX' })
    expect(link.getState().status).toBe('ready')
  })

  it('plus aucun appel : la carte coupe en 500 ms (LEASE)', async () => {
    const { clock, board, link } = await ready()
    await advance(clock, 1000, 25, () => link.drive(true))
    expect(board.snapshot().output).toBe(true)
    const lastFire = sent(board, 'F').at(-1)!.at
    // La page gèle : plus de drive. Le lien ne renouvelle rien.
    await advance(clock, 1000)
    const { output, cause, lastCutAt } = board.snapshot()
    expect(output).toBe(false)
    expect(cause).toBe('LEASE')
    expect(lastCutAt).toBe(lastFire + 500)
    expect(sent(board, 'F').at(-1)!.at).toBe(lastFire)
    // Le lien l'apprend par la ligne d'état suivante (réponse à un H de présence).
    expect(link.getState().board).toMatchObject({ output: false, cause: 'LEASE' })
    expect(link.getState().phase).toBe('cool')
  })

  it('rechargement simulé : nouvelle ouverture, nouvelle bannière, carte remise à zéro', async () => {
    const { clock, board, link } = await ready()
    await advance(clock, 300, 25, () => link.drive(true))
    expect(board.snapshot().output).toBe(true)
    await link.close()
    expect(board.isOpen()).toBe(false)

    const reloaded = createSmokeBoardLink({ port: board.port, clock })
    const opening = reloaded.open()
    // Remise à zéro à l'ouverture : relais retombé, pas encore de bannière, aucun ordre.
    expect(board.snapshot()).toMatchObject({ output: false, cause: 'CMD' })
    await advance(clock, 900)
    expect(reloaded.getState().status).toBe('connecting')
    const before = board.received.length
    reloaded.drive(true)
    expect(board.received).toHaveLength(before)
    await advance(clock, 100)
    expect(await opening).toBe('ready')
    expect(reloaded.getState().version).toBe(FAKE_BOARD_VERSION)
  })

  it('n’agit pas sur une carte qui n’est pas prête', async () => {
    const { clock, board, link } = await ready({ mute: true }, false)
    await advance(clock, 2000)
    expect(link.getState().status).toBe('silent')
    const count = board.received.length
    link.drive(true)
    link.drive(false)
    await flush()
    expect(board.received).toHaveLength(count)
  })
})

describe('présence et silence', () => {
  it('envoie un H quand rien n’est parti depuis un moment, jamais plus vite', async () => {
    const { clock, board } = await ready()
    await advance(clock, 3000, 25)
    const hellos = sent(board, 'H')
    expect(hellos.length).toBeGreaterThanOrEqual(8)
    for (let index = 1; index < hellos.length; index += 1) {
      expect(hellos[index]!.at - hellos[index - 1]!.at).toBeGreaterThanOrEqual(BOARD_PRESENCE_MS)
    }
    expect(board.received.every((entry) => entry.line === 'H')).toBe(true)
  })

  it('n’envoie pas de H pendant que les F tiennent la carte au courant', async () => {
    const { clock, board, link } = await ready()
    const hellos = sent(board, 'H').length
    await advance(clock, 1000, 25, () => link.drive(true))
    expect(sent(board, 'H')).toHaveLength(hellos)
  })

  it('un H n’allume rien et ne renouvelle pas le bail', async () => {
    const { clock, board, link } = await ready()
    link.drive(true)
    await advance(clock, 450)
    expect(board.snapshot().output).toBe(true)
    await advance(clock, 200)
    expect(sent(board, 'H').length).toBeGreaterThan(0)
    expect(board.snapshot().output).toBe(false)
    expect(link.getState().status).toBe('ready')
  })

  it('reste prête tant que la carte répond, même sans aucun ordre', async () => {
    const { clock, link } = await ready()
    await advance(clock, 10_000)
    expect(link.getState().status).toBe('ready')
  })

  it('déclare la carte muette après 1 s sans ligne d’état alors qu’on lui parle', async () => {
    const { clock, board, link } = await ready()
    board.mute(true)
    link.drive(true)
    await advance(clock, BOARD_SILENCE_MS - 200, 25, () => link.drive(true))
    expect(link.getState().status).toBe('ready')
    await advance(clock, 400, 25, () => link.drive(true))
    expect(link.getState()).toMatchObject({ status: 'silent', problem: 'no_reply' })
  })

  it('envoie un dernier 0 en déclarant la carte muette, puis plus rien', async () => {
    const { clock, board, link } = await ready()
    board.mute(true)
    link.drive(true)
    await advance(clock, 1500)
    expect(link.getState().status).toBe('silent')
    expect(sent(board, '0')).toHaveLength(1)
    const count = board.received.length
    await advance(clock, 2000, 25, () => link.drive(true))
    expect(board.received).toHaveLength(count)
  })
})

describe('écarts entre la carte et nos ordres', () => {
  it('sortie annoncée à 1 plus d’un bail après le dernier 0 : état d’erreur', async () => {
    const { clock, board, link, states } = await ready()
    link.drive(true)
    await advance(clock, 100)
    link.drive(false)
    await advance(clock, 300)
    board.inject('S 1 FIRE LEASE\n')
    await flush()
    // Dans le bail : la carte peut encore être en train de répondre à un ordre précédent.
    expect(link.getState().status).toBe('ready')
    await advance(clock, 400)
    board.inject('S 1 FIRE LEASE\n')
    await flush()
    expect(link.getState()).toMatchObject({ status: 'fault', problem: 'output_mismatch' })
    expect(states.at(-1)!.status).toBe('fault')
    // Plus aucun ordre F après l'échec ; un 0 de dernier recours est parti.
    const count = board.received.length
    link.drive(true)
    await advance(clock, 1000, 25, () => link.drive(true))
    expect(sent(board, 'F')).toHaveLength(1)
    expect(board.received.length).toBe(count)
    expect(sent(board, '0').length).toBeGreaterThanOrEqual(2)
  })

  it('sortie annoncée à 1 bien après le dernier F sans nouvel ordre : état d’erreur', async () => {
    const { clock, board, link } = await ready()
    link.drive(true)
    // Carte muette : pas de ligne `COOL` qui ferait partir un 0, le dernier ordre reste ce F.
    board.mute(true)
    await advance(clock, 800)
    board.inject('S 1 FIRE LEASE\n')
    await flush()
    expect(link.getState().problem).toBe('output_mismatch')
  })

  it('sortie annoncée à 1 pendant un jet en cours : aucun écart', async () => {
    const { clock, link } = await ready()
    await advance(clock, 3000, 25, () => link.drive(true))
    expect(link.getState()).toMatchObject({ status: 'ready', board: { output: true } })
  })

  it('une carte qui redémarre en cours de partie est une erreur (plafond et pause remis à zéro)', async () => {
    const { clock, board, link } = await ready()
    await advance(clock, 500, 25, () => link.drive(true))
    board.inject(`${FAKE_BOARD_BANNER}\n`)
    await flush()
    expect(link.getState()).toMatchObject({ status: 'fault', problem: 'board_reset' })
  })

  it('ignore une ligne illisible de la carte, sans la compter comme une réponse', async () => {
    const { clock, board, link } = await ready()
    board.mute(true)
    link.drive(true)
    await advance(clock, 1200, 25, () => {
      board.inject('bruit\n')
      link.drive(true)
    })
    expect(link.getState().status).toBe('silent')
  })
})

describe('abonnement', () => {
  it('prévient aux changements d’état, une fois par ligne d’état différente', async () => {
    const { clock, link, states } = await ready()
    expect(states.slice(0, 2).map((state) => state.status)).toEqual(['connecting', 'ready'])
    states.length = 0
    await advance(clock, 1000, 25, () => link.drive(true))
    // 40 Hz pendant 1 s : une seule ligne d'état différente (sortie allumée), pas dix.
    expect(states).toHaveLength(1)
    expect(states[0]!.board).toEqual({ output: true, state: 'FIRE', cause: 'CMD' })
  })

  it('se désabonne', async () => {
    const { clock, board, link } = await ready()
    const calls: SmokeBoardStatus[] = []
    const off = link.onChange((state) => calls.push(state.status))
    off()
    board.unplug()
    await advance(clock, 100)
    expect(calls).toEqual([])
  })
})
