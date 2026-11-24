import { createSimulationOutput } from '@hardware/dmx/simulationOutput'
import type { LightingWarning } from '@hardware/lighting/lightingController'
import { createLightingController } from '@hardware/lighting/lightingController'
import type { SmokeBoardLink, SmokeBoardState } from '@hardware/smoke/boardLink'

import { advance } from '../_helpers/fakeSmokeBoard'
import { createManualClock, flushPromises } from '../_helpers/manualClock'
import { lightingConfig } from '../_helpers/rig'

const SMOKE_CHANNEL = 29
const SMOKE_LEVEL = 180
const STEP = 10

const READY: SmokeBoardState = {
  status: 'ready',
  problem: null,
  version: '1.0.0',
  board: null,
  phase: 'ready',
}

/** Lien factice : état piloté par le test, ordres `drive` enregistrés (ou qui lèvent). */
function createStubLink() {
  let state = READY
  const listeners = new Set<(next: SmokeBoardState) => void>()
  const orders: boolean[] = []
  const behaviour = { throws: false }
  const link: SmokeBoardLink = {
    open: async () => 'ready',
    drive: (firing) => {
      if (behaviour.throws) {
        throw new Error('lien cassé')
      }
      orders.push(firing)
    },
    getState: () => state,
    onChange: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close: async () => undefined,
  }
  const announce = (next: Partial<SmokeBoardState>) => {
    state = { ...state, ...next }
    for (const listener of [...listeners]) {
      listener(state)
    }
  }
  return { link, orders, behaviour, announce, listenerCount: () => listeners.size }
}

async function setup() {
  const clock = createManualClock(10_000)
  const stub = createStubLink()
  const output = createSimulationOutput()
  const warnings: LightingWarning[] = []
  const controller = createLightingController({
    config: lightingConfig(),
    output,
    clock,
    doc: null,
    smokeLink: stub.link,
  })
  controller.onWarning((warning) => warnings.push(warning))
  await controller.start()
  await advance(clock, 1_000, STEP)
  controller.smoke.arm()
  return { clock, stub, output, controller, warnings }
}

type Context = Awaited<ReturnType<typeof setup>>
const dmx = (context: Context) => context.output.lastFrame()[SMOKE_CHANNEL]

async function startJet(context: Context) {
  expect(context.controller.smoke.fire(3_000)).toMatchObject({ ok: true })
  await advance(context.clock, 300, STEP)
  await flushPromises()
  expect(dmx(context)).toBe(SMOKE_LEVEL)
}

describe('coupures de la fumée avec la carte', () => {
  let context: Context | null = null
  afterEach(async () => {
    await context?.controller.stop()
    context = null
  })

  it('la carte coupe d’elle-même (pause `cool`) : jet et canal DMX de fumée coupés aussi', async () => {
    context = await setup()
    await startJet(context)
    const { stub, controller, warnings } = context

    stub.announce({ phase: 'cool' })
    await flushPromises()

    expect(dmx(context)).toBe(0)
    expect(controller.getState().smoke).toMatchObject({ status: 'cooldown' })
    expect(stub.orders.at(-1)).toBe(false)
    // La carte répond : ce n'est pas une carte perdue, la fumée reste armée.
    expect(controller.getState().smoke.armed).toBe(true)
    expect(warnings.some((warning) => warning.kind === 'board_lost')).toBe(false)
  })

  it('la carte annonce `cool` sans jet en cours : rien n’est coupé ni signalé', async () => {
    context = await setup()
    const { stub, controller } = context
    const before = stub.orders.length

    stub.announce({ phase: 'cool' })
    await flushPromises()

    expect(controller.getState().smoke).toMatchObject({ status: 'ready', armed: true })
    expect(stub.orders.slice(before).every((order) => order === false)).toBe(true)
  })

  it('contrôleur arrêté : le lien (qui lui survit) ne lui parle plus', async () => {
    context = await setup()
    const { stub, controller, warnings } = context
    expect(stub.listenerCount()).toBe(1)

    await controller.stop()
    expect(stub.listenerCount()).toBe(0)
    stub.announce({ status: 'disconnected', phase: null })
    await flushPromises()

    expect(warnings.some((warning) => warning.kind === 'board_lost')).toBe(false)
  })

  it('désarmer pendant un jet : ordre d’arrêt à la carte et trame à 0 tout de suite', async () => {
    context = await setup()
    await startJet(context)
    const { stub, controller } = context
    expect(stub.orders.at(-1)).toBe(true)

    controller.smoke.disarm()
    // Aucune avance de l'horloge : seul l'ordre envoyé par la coupure peut l'avoir arrêtée.
    expect(stub.orders.at(-1)).toBe(false)
    await flushPromises()
    expect(dmx(context)).toBe(0)
    expect(controller.getState().smoke).toMatchObject({ armed: false, lastStopReason: 'disarmed' })
  })

  describe('lien dont `drive` lève', () => {
    it('l’arrêt d’urgence envoie quand même la trame noire, fumée coupée et désarmée', async () => {
      context = await setup()
      await startJet(context)
      const { stub, controller, warnings } = context

      stub.behaviour.throws = true
      expect(() => controller.emergencyStop('test')).not.toThrow()
      await flushPromises()

      expect(dmx(context)).toBe(0)
      expect(controller.getState()).toMatchObject({ emergency: true })
      expect(controller.getState().smoke).toMatchObject({ armed: false })
      const lost = warnings.filter((warning) => warning.kind === 'board_lost')
      expect(lost).toMatchObject([{ problem: 'write_error' }])
    })

    it('la coupure par pause de partie va jusqu’au bout et l’erreur n’est signalée qu’une fois', async () => {
      context = await setup()
      await startJet(context)
      const { stub, controller, warnings, clock } = context

      stub.behaviour.throws = true
      expect(() => controller.setGamePaused(true)).not.toThrow()
      await flushPromises()
      expect(dmx(context)).toBe(0)
      expect(controller.getState().smoke.status).toBe('cooldown')

      // Chaque trame redonne l'ordre au lien : l'échec répété ne remplit pas les avertissements.
      await advance(clock, 500, STEP)
      expect(warnings.filter((warning) => warning.kind === 'board_lost')).toHaveLength(1)
    })

    it('un lien qui lève pendant un jet coupe la fumée au lieu de la laisser sortir', async () => {
      context = await setup()
      await startJet(context)
      const { stub, controller, clock } = context

      stub.behaviour.throws = true
      await advance(clock, 100, STEP)
      await flushPromises()

      expect(dmx(context)).toBe(0)
      expect(controller.getState().smoke).toMatchObject({ armed: false })
    })

    it('fermeture : la trame noire part malgré le lien', async () => {
      context = await setup()
      await startJet(context)
      const { stub, controller, output } = context

      stub.behaviour.throws = true
      await expect(controller.stop()).resolves.toBeUndefined()
      expect(output.lastFrame()[SMOKE_CHANNEL]).toBe(0)
    })
  })
})
