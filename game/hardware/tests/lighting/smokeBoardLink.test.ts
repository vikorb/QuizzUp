import { createSimulationOutput } from '@hardware/dmx/simulationOutput'
import type { LightingWarning } from '@hardware/lighting/lightingController'
import { createLightingController, WATCHDOG_STALL_MS } from '@hardware/lighting/lightingController'
import { SCENE_IDS } from '@hardware/lighting/scenes'
import { createSmokeBoardLink } from '@hardware/smoke/boardLink'

import {
  advance,
  createFakeSmokeBoard,
  FAKE_BOARD_BANNER,
  FAKE_BOARD_WARM_MS,
  flush,
} from '../_helpers/fakeSmokeBoard'
import { createManualClock, flushPromises } from '../_helpers/manualClock'
import { lightingConfig } from '../_helpers/rig'

const SMOKE_CHANNEL = 29
const SMOKE_LEVEL = 180
const STEP = 10

type Context = Awaited<ReturnType<typeof setup>>

/** Une carte, son lien, un contrôleur démarré : carte prête (pause du démarrage écoulée), fumée armée. */
async function setup(options: { doc?: Document | null; armed?: boolean } = {}) {
  const clock = createManualClock(10_000)
  const board = createFakeSmokeBoard({ clock })
  const link = createSmokeBoardLink({ port: board.port, clock })
  const output = createSimulationOutput()
  const warnings: LightingWarning[] = []
  const controller = createLightingController({
    config: lightingConfig(),
    output,
    clock,
    doc: options.doc ?? null,
    smokeLink: link,
  })
  controller.onWarning((warning) => warnings.push(warning))
  const opening = link.open()
  await advance(clock, 1_000, STEP)
  expect(await opening).toBe('ready')
  await controller.start()
  await advance(clock, FAKE_BOARD_WARM_MS, STEP)
  expect(link.getState().phase).toBe('ready')
  if (options.armed !== false) {
    controller.smoke.arm()
  }
  return { clock, board, link, output, controller, warnings }
}

const fires = (board: Context['board']) => board.received.filter((entry) => entry.line === 'F')
const dmx = (context: Context) => context.output.lastFrame()[SMOKE_CHANNEL]
/** Sortie de la carte à l'instant de l'horloge, sans avancer le temps : seul un ordre déjà reçu compte. */
const boardOutput = (context: Context) => context.board.snapshot().output

describe('fumée par la carte : lien branché au contrôleur de lumières', () => {
  let context: Context | null = null
  afterEach(async () => {
    vi.restoreAllMocks()
    await context?.controller.stop()
    context = null
  })

  it('un jet : un ordre F à chaque trame au plus toutes les 100 ms, relais DMX et carte ensemble, 0 à la fin', async () => {
    context = await setup()
    const { clock, board, controller } = context
    expect(controller.smoke.fire(1_000)).toMatchObject({ ok: true })
    await advance(clock, 300, STEP)
    expect(boardOutput(context)).toBe(true)
    expect(dmx(context)).toBe(SMOKE_LEVEL)

    await advance(clock, 1_000, STEP)
    // Jet terminé (1 s) : la carte est coupée par le « 0 » du contrôleur, pas par son bail.
    expect(boardOutput(context)).toBe(false)
    expect(dmx(context)).toBe(0)
    expect(board.snapshot().cause).toBe('CMD')
    expect(fires(board).length).toBeGreaterThanOrEqual(8)
    expect(fires(board).length).toBeLessThanOrEqual(11)
    const times = fires(board).map((entry) => entry.at)
    for (let index = 1; index < times.length; index += 1) {
      expect(times[index]! - times[index - 1]!).toBeGreaterThanOrEqual(100)
    }
    // Plus aucun F une fois le jet fini.
    const count = fires(board).length
    await advance(clock, 3_000, STEP)
    expect(fires(board)).toHaveLength(count)
  })

  it('arrêt d’urgence : carte et DMX coupés tout de suite, rien ne repart après le réarmement', async () => {
    context = await setup()
    const { clock, board, controller } = context
    controller.smoke.fire(3_000)
    await advance(clock, 300, STEP)
    expect(boardOutput(context)).toBe(true)
    const count = fires(board).length

    controller.emergencyStop('test')
    // Aucune avance de l'horloge : seul l'ordre envoyé à l'arrêt peut avoir coupé la carte.
    await flush()
    expect(boardOutput(context)).toBe(false)
    expect(board.received.at(-1)?.line).toBe('0')
    await flushPromises()
    expect(dmx(context)).toBe(0)

    controller.resetEmergency()
    await advance(clock, 5_600, STEP)
    expect(fires(board)).toHaveLength(count)
    // Désarmée par l'arrêt d'urgence, et la pause de sécurité du jet coupé court encore.
    expect(controller.getState().smoke).toMatchObject({ armed: false, status: 'cooldown' })
    expect(controller.smoke.fire(1_000)).toEqual({ ok: false, reason: 'cooldown' })
    expect(boardOutput(context)).toBe(false)
  })

  it('pause de partie : jet coupé à la carte tout de suite, refus, et aucun jet rejoué à la reprise', async () => {
    context = await setup()
    const { clock, board, controller } = context
    controller.smoke.fire(3_000)
    await advance(clock, 300, STEP)
    const count = fires(board).length

    controller.setGamePaused(true)
    await flush()
    expect(boardOutput(context)).toBe(false)
    expect(board.received.at(-1)?.line).toBe('0')
    expect(controller.smoke.fire(1_000)).toEqual({ ok: false, reason: 'paused' })

    await advance(clock, 1_000, STEP)
    controller.setGamePaused(false)
    await advance(clock, 6_000, STEP)
    expect(fires(board)).toHaveLength(count)
    expect(boardOutput(context)).toBe(false)
    expect(controller.getState().smoke.status).toBe('cooldown')
  })

  it('page gelée (aucune trame) : aucun ordre, la carte coupe seule à la fin de son bail', async () => {
    context = await setup()
    const { clock, board, controller } = context
    expect(controller.diagnostics.begin()).toEqual({ ok: true })
    controller.smoke.fire(3_000)
    await advance(clock, 300, STEP)
    expect(boardOutput(context)).toBe(true)

    expect(controller.diagnostics.freezeOutput(3_000, { confirm: true })).toEqual({ ok: true })
    await flush()
    // La trame du gel part avant le gel : un dernier F a pu partir avec elle, jamais après.
    const count = fires(board).length
    const lastFire = fires(board).at(-1)!.at

    await advance(clock, 1_200, STEP)
    expect(fires(board)).toHaveLength(count)
    expect(boardOutput(context)).toBe(false)
    const snapshot = board.snapshot()
    expect(snapshot.cause).toBe('LEASE')
    expect(snapshot.lastCutAt! - lastFire).toBeLessThanOrEqual(WATCHDOG_STALL_MS + STEP)

    // Fin du gel : la fumée doit être réarmée par un humain, rien ne repart seul.
    await advance(clock, 2_500, STEP)
    expect(controller.getState().smoke.armed).toBe(false)
    expect(fires(board)).toHaveLength(count)
    expect(boardOutput(context)).toBe(false)
  })

  describe('onglet masqué et fermeture', () => {
    it('onglet masqué en plein jet : carte coupée tout de suite, jet refusé tant que masqué', async () => {
      context = await setup({ doc: document })
      const { clock, board, controller, warnings } = context
      controller.smoke.fire(3_000)
      await advance(clock, 300, STEP)
      const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

      document.dispatchEvent(new Event('visibilitychange'))
      await flush()
      expect(boardOutput(context)).toBe(false)
      expect(board.received.at(-1)?.line).toBe('0')
      expect(warnings.some((warning) => warning.kind === 'page_hidden')).toBe(true)
      expect(controller.smoke.fire(1_000)).toEqual({ ok: false, reason: 'page_hidden' })
      visibility.mockRestore()
    })

    it('onglet masqué pendant un gel : le « 0 » part quand même (aucune trame ne le porte)', async () => {
      context = await setup({ doc: document })
      const { clock, board, controller } = context
      controller.diagnostics.begin()
      controller.smoke.fire(3_000)
      await advance(clock, 300, STEP)
      controller.diagnostics.freezeOutput(5_000, { confirm: true })
      await flush()
      expect(boardOutput(context)).toBe(true)
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

      document.dispatchEvent(new Event('visibilitychange'))
      await flush()
      expect(boardOutput(context)).toBe(false)
      expect(board.received.at(-1)?.line).toBe('0')
    })

    it('pagehide : carte coupée tout de suite', async () => {
      context = await setup({ doc: document })
      const { clock, board, controller } = context
      controller.smoke.fire(3_000)
      await advance(clock, 300, STEP)
      expect(boardOutput(context)).toBe(true)

      window.dispatchEvent(new Event('pagehide'))
      await flush()
      expect(boardOutput(context)).toBe(false)
      expect(board.received.at(-1)?.line).toBe('0')
    })

    it('stop() : carte coupée tout de suite', async () => {
      context = await setup()
      const { clock, board, controller } = context
      controller.smoke.fire(3_000)
      await advance(clock, 300, STEP)

      await controller.stop()
      expect(boardOutput(context)).toBe(false)
      expect(board.received.map((entry) => entry.line)).toContain('0')
    })

    it('changement de sortie DMX en plein jet : carte coupée tout de suite', async () => {
      context = await setup()
      const { clock, board, controller } = context
      controller.smoke.fire(3_000)
      await advance(clock, 300, STEP)

      // L'ancienne sortie ne se ferme pas : aucune trame ne peut porter l'ordre, seul le contrôleur le peut.
      context.output.close = () => new Promise<void>(() => undefined)
      const pending = controller.setOutput(createSimulationOutput())
      await flush()
      expect(boardOutput(context)).toBe(false)
      expect(board.received.at(-1)?.line).toBe('0')
      await advance(clock, 2_000, STEP)
      await pending
    })
  })

  describe('lien perdu', () => {
    const expectLostAndDisarmed = async (current: Context) => {
      await flush()
      expect(current.controller.getState().smoke).toMatchObject({
        status: 'cooldown',
        armed: false,
        lastStopReason: 'output_error',
      })
      expect(current.warnings.some((warning) => warning.kind === 'board_lost')).toBe(true)
      await flushPromises()
      expect(dmx(current)).toBe(0)
      current.controller.smoke.arm()
      expect(current.controller.smoke.fire(1_000)).toEqual({
        ok: false,
        reason: 'board_unavailable',
      })
    }

    it('câble débranché en plein jet : jet coupé (relais DMX compris), fumée désarmée', async () => {
      context = await setup()
      const { clock, board, controller } = context
      controller.smoke.fire(3_000)
      await advance(clock, 300, STEP)
      expect(dmx(context)).toBe(SMOKE_LEVEL)

      board.unplug()
      await advance(clock, 50, STEP)
      await expectLostAndDisarmed(context)
    })

    it('carte muette depuis 1 s en plein jet : jet coupé, fumée désarmée', async () => {
      context = await setup()
      const { clock, board, controller } = context
      controller.smoke.fire(3_000)
      await advance(clock, 300, STEP)

      board.mute(true)
      await advance(clock, 1_200, STEP)
      expect(context.link.getState().status).toBe('silent')
      await expectLostAndDisarmed(context)
    })

    it('carte remise à zéro en cours de partie (bannière reçue) : jet coupé, fumée désarmée', async () => {
      context = await setup()
      const { clock, board, controller } = context
      controller.smoke.fire(3_000)
      await advance(clock, 300, STEP)

      board.inject(`${FAKE_BOARD_BANNER}\n`)
      await advance(clock, 50, STEP)
      expect(context.link.getState()).toMatchObject({ status: 'fault', problem: 'board_reset' })
      await expectLostAndDisarmed(context)
    })

    it('lien déjà perdu à la création : fumée désarmée et jet refusé', async () => {
      const clock = createManualClock(10_000)
      const board = createFakeSmokeBoard({ clock, banner: null })
      const link = createSmokeBoardLink({ port: board.port, clock })
      void link.open()
      await advance(clock, 4_000, STEP)
      expect(link.getState().status).toBe('no_firmware')
      const controller = createLightingController({
        // Sans confirmation exigée, la fumée démarre armée : le lien perdu la désarme aussitôt.
        config: lightingConfig({
          smoke: { ...lightingConfig().smoke, requireConfirmation: false },
        }),
        output: createSimulationOutput(),
        clock,
        doc: null,
        smokeLink: link,
      })
      expect(controller.getState().smoke.armed).toBe(false)
      controller.smoke.arm()
      expect(controller.smoke.fire(1_000)).toEqual({ ok: false, reason: 'board_unavailable' })
    })
  })

  describe('refus board_unavailable', () => {
    it('avant la bannière : refus, fumée toujours armée et prête', async () => {
      const clock = createManualClock(10_000)
      const board = createFakeSmokeBoard({ clock })
      const link = createSmokeBoardLink({ port: board.port, clock })
      const controller = createLightingController({
        config: lightingConfig(),
        output: createSimulationOutput(),
        clock,
        doc: null,
        smokeLink: link,
      })
      controller.smoke.arm()
      expect(controller.smoke.fire(1_000)).toEqual({ ok: false, reason: 'board_unavailable' })
      expect(controller.getState().smoke).toMatchObject({ status: 'ready', armed: true })
      expect(board.received).toHaveLength(0)
    })

    it('carte en pause après sa remise à zéro : refus jusqu’à la fin des 5 s', async () => {
      const clock = createManualClock(10_000)
      const board = createFakeSmokeBoard({ clock })
      const link = createSmokeBoardLink({ port: board.port, clock })
      const controller = createLightingController({
        config: lightingConfig(),
        output: createSimulationOutput(),
        clock,
        doc: null,
        smokeLink: link,
      })
      void link.open()
      await advance(clock, 1_000, STEP)
      controller.smoke.arm()
      expect(link.getState().phase).toBe('cool')
      expect(controller.smoke.fire(1_000)).toEqual({ ok: false, reason: 'board_unavailable' })

      await advance(clock, FAKE_BOARD_WARM_MS, STEP)
      expect(controller.smoke.fire(1_000)).toMatchObject({ ok: true })
    })

    it('une scène qui demande de la fumée est refusée et signalée de la même façon', async () => {
      const clock = createManualClock(10_000)
      const board = createFakeSmokeBoard({ clock })
      const link = createSmokeBoardLink({ port: board.port, clock })
      const controller = createLightingController({
        config: lightingConfig(),
        output: createSimulationOutput(),
        clock,
        doc: null,
        smokeLink: link,
      })
      const warnings: LightingWarning[] = []
      controller.onWarning((warning) => warnings.push(warning))
      controller.smoke.arm()
      await controller.start()
      controller.playScene(SCENE_IDS.VICTORY, { desk: 1 })
      await advance(clock, 1_000, STEP)

      expect(warnings).toContainEqual(
        expect.objectContaining({ kind: 'smoke_refused', reason: 'board_unavailable' })
      )
      expect(controller.getState().smoke.status).toBe('ready')
      await controller.stop()
    })

    it('carte enregistrée dans la configuration mais aucun lien : refus', async () => {
      const clock = createManualClock(10_000)
      const base = lightingConfig()
      const controller = createLightingController({
        config: {
          ...base,
          smoke: {
            ...base.smoke,
            board: { kind: 'uno-serial', usbVendorId: 0x2341, usbProductId: 0x0043 },
          },
        },
        output: createSimulationOutput(),
        clock,
        doc: null,
      })
      controller.smoke.arm()
      expect(controller.smoke.fire(1_000)).toEqual({ ok: false, reason: 'board_unavailable' })
    })

    it('sans carte ni lien : le comportement d’avant (relais DMX seul) ne change pas', async () => {
      const clock = createManualClock(10_000)
      const controller = createLightingController({
        config: lightingConfig(),
        output: createSimulationOutput(),
        clock,
        doc: null,
      })
      controller.smoke.arm()
      expect(controller.smoke.fire(1_000)).toMatchObject({ ok: true })
    })

    it('l’arrêt d’urgence garde son motif', async () => {
      context = await setup()
      context.controller.emergencyStop()
      expect(context.controller.smoke.fire(1_000)).toEqual({ ok: false, reason: 'emergency' })
    })
  })

  describe('carte rebranchée', () => {
    it('nouveau lien prêt, mais fumée désarmée : un humain doit la réarmer', async () => {
      context = await setup()
      const { clock, board, controller } = context
      controller.smoke.fire(3_000)
      await advance(clock, 300, STEP)
      board.unplug()
      await advance(clock, 50, STEP)
      await flush()
      expect(controller.getState().smoke.armed).toBe(false)

      const second = createFakeSmokeBoard({ clock })
      const link = createSmokeBoardLink({ port: second.port, clock })
      controller.setSmokeLink(link)
      const opening = link.open()
      await advance(clock, 1_000, STEP)
      expect(await opening).toBe('ready')
      await advance(clock, FAKE_BOARD_WARM_MS, STEP)

      // Le jet coupé à la perte de la carte garde sa pause de sécurité.
      await advance(clock, 30_000, 100)
      expect(link.getState().phase).toBe('ready')
      expect(controller.getState().smoke).toMatchObject({ status: 'unarmed', armed: false })
      expect(controller.smoke.fire(1_000)).toEqual({ ok: false, reason: 'not_armed' })
      expect(second.received.filter((entry) => entry.line === 'F')).toHaveLength(0)

      controller.smoke.arm()
      expect(controller.smoke.fire(1_000)).toMatchObject({ ok: true })
      await advance(clock, 300, STEP)
      expect(second.snapshot().output).toBe(true)
    })

    it('remplacer le lien en plein jet coupe l’ancienne carte', async () => {
      context = await setup()
      const { clock, controller } = context
      controller.smoke.fire(3_000)
      await advance(clock, 300, STEP)

      const second = createFakeSmokeBoard({ clock })
      controller.setSmokeLink(createSmokeBoardLink({ port: second.port, clock }))
      await flush()
      expect(boardOutput(context)).toBe(false)
      expect(controller.getState().smoke).toMatchObject({ armed: false, status: 'cooldown' })
    })
  })
})
