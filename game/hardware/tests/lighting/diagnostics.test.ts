import { createSimulationOutput } from '@hardware/dmx/simulationOutput'
import {
  createLightingController,
  DIAGNOSTICS_IDLE_MS,
  MAX_FREEZE_MS,
} from '@hardware/lighting/lightingController'
import { SCENE_IDS } from '@hardware/lighting/scenes'

import { advanceAsync, createManualClock } from '../_helpers/manualClock'
import { lightingConfig } from '../_helpers/rig'

const SMOKE = 30

const setup = async () => {
  const clock = createManualClock(10_000)
  const output = createSimulationOutput()
  const controller = createLightingController({
    config: lightingConfig(),
    output,
    clock,
    doc: null,
  })
  await controller.start()
  const frame = () => output.lastFrame()
  return { clock, output, controller, frame }
}

describe('diagnostic matériel', () => {
  it('refuse les réglages hors diagnostic', async () => {
    const { controller } = await setup()
    expect(controller.diagnostics.setChannel(1, 255)).toEqual({ ok: false, reason: 'not_active' })
    expect(controller.diagnostics.setFixture('par1', { intensity: 1 })).toEqual({
      ok: false,
      reason: 'not_active',
    })
    expect(controller.diagnostics.getState()).toEqual({
      active: false,
      allowUnknownChannels: false,
      frozenUntil: null,
    })
    await controller.stop()
  })

  it('pilote un canal brut et suspend les scènes', async () => {
    const { controller, clock, frame } = await setup()
    expect(controller.diagnostics.begin()).toEqual({ ok: true })
    await advanceAsync(clock, 100)
    expect(frame().every((value) => value === 0)).toBe(true)

    expect(controller.diagnostics.setChannel(2, 200)).toEqual({ ok: true })
    expect(controller.diagnostics.setChannel(2, 999)).toEqual({ ok: true })
    await advanceAsync(clock, 100)
    expect(frame()[1]).toBe(255)

    // Les événements de jeu ne relancent ni scène ni fumée pendant le diagnostic.
    controller.smoke.arm()
    controller.handleGameEvent({ type: 'game_ended', payload: { reason: 'completed' } })
    expect(controller.playScene(SCENE_IDS.BUZZ)).toBe(false)
    expect(controller.identifyFixture('par1')).toBe(false)
    await advanceAsync(clock, 500)
    expect(frame()[SMOKE - 1]).toBe(0)
    expect(frame()[1]).toBe(255)
    await controller.stop()
  })

  it('protège les canaux de fumée et les canaux inconnus', async () => {
    const { controller } = await setup()
    controller.diagnostics.begin()
    expect(controller.diagnostics.setChannel(SMOKE, 255)).toEqual({
      ok: false,
      reason: 'smoke_channel',
    })
    expect(controller.diagnostics.setChannel(100, 255)).toEqual({
      ok: false,
      reason: 'unknown_channel',
    })
    expect(controller.diagnostics.setChannel(0, 1)).toEqual({
      ok: false,
      reason: 'invalid_address',
    })
    expect(controller.diagnostics.setChannel(513, 1)).toEqual({
      ok: false,
      reason: 'invalid_address',
    })
    expect(controller.diagnostics.setChannel(1.5, 1)).toEqual({
      ok: false,
      reason: 'invalid_address',
    })

    controller.diagnostics.begin({ allowUnknownChannels: true })
    expect(controller.diagnostics.setChannel(100, 255)).toEqual({ ok: true })
    // Même en recherche d'adresse, un canal de fumée connu reste interdit.
    expect(controller.diagnostics.setChannel(SMOKE, 255).ok).toBe(false)
    expect(controller.diagnostics.getState().allowUnknownChannels).toBe(true)
    await controller.stop()
  })

  it('règle un appareil configuré', async () => {
    const { controller, clock, frame } = await setup()
    controller.diagnostics.begin()
    expect(
      controller.diagnostics.setFixture('par2', { color: { r: 10, g: 20, b: 30 }, intensity: 1 })
    ).toEqual({ ok: true })
    expect(
      controller.diagnostics.setFixture('head', { position: { pan: 0xff00, tilt: 0 } })
    ).toEqual({ ok: true })
    expect(controller.diagnostics.setFixture('head', { intensity: 1, strobe: 5 }).ok).toBe(true)
    expect(controller.diagnostics.setFixture('smoke', { intensity: 1 })).toEqual({
      ok: false,
      reason: 'unknown_fixture',
    })
    expect(controller.diagnostics.setFixture('nope', {}).ok).toBe(false)
    await advanceAsync(clock, 100)
    expect([...frame().subarray(3, 6)]).toEqual([10, 20, 30])
    expect(frame()[9]).toBe(0xff)
    expect(frame()[13]).toBe(255)

    controller.diagnostics.clear()
    await advanceAsync(clock, 100)
    expect(frame().every((value) => value === 0)).toBe(true)
    await controller.stop()
  })

  it('teste la fumée par le contrôleur sécurisé uniquement', async () => {
    const { controller, clock, frame } = await setup()
    controller.diagnostics.begin()
    expect(controller.smoke.fire(1_000)).toEqual({ ok: false, reason: 'not_armed' })
    controller.smoke.arm()
    expect(controller.smoke.fire(1_000).ok).toBe(true)
    await advanceAsync(clock, 100)
    expect(frame()[SMOKE - 1]).toBe(180)
    await advanceAsync(clock, 1_000)
    expect(frame()[SMOKE - 1]).toBe(0)
    await controller.stop()
  })

  it('gèle les trames pour tester le relais fumée, puis reprend', async () => {
    const { controller, clock, output, frame } = await setup()
    controller.diagnostics.begin()
    controller.smoke.arm()
    expect(controller.diagnostics.freezeOutput(2_000, { confirm: false })).toEqual({
      ok: false,
      reason: 'not_confirmed',
    })
    expect(controller.diagnostics.freezeOutput(MAX_FREEZE_MS + 1, { confirm: true }).ok).toBe(false)
    expect(controller.diagnostics.freezeOutput(0, { confirm: true }).ok).toBe(false)

    controller.smoke.fire(3_000)
    await advanceAsync(clock, 100)
    expect(controller.diagnostics.freezeOutput(2_000, { confirm: true })).toEqual({ ok: true })
    expect(controller.diagnostics.getState().frozenUntil).toBe(clock.now() + 2_000)
    const sent = output.framesSent()
    await advanceAsync(clock, 1_500)
    // Aucune trame : l'interface répète la dernière (fumée active) comme après un plantage.
    expect(output.framesSent()).toBe(sent)
    expect(frame()[SMOKE - 1]).toBe(180)
    expect(controller.getState().lastWarning?.kind).not.toBe('watchdog')

    await advanceAsync(clock, 2_000)
    expect(output.framesSent()).toBeGreaterThan(sent)
    expect(frame()[SMOKE - 1]).toBe(0)
    expect(controller.diagnostics.getState().frozenUntil).toBeNull()
    await controller.stop()
  })

  it('fige la trame de fumée même quand le gel suit immédiatement l’émission', async () => {
    const { controller, clock, frame } = await setup()
    controller.diagnostics.begin()
    controller.smoke.arm()
    // Même enchaînement que l'écran : émission puis gel, sans tick entre les deux.
    controller.smoke.fire(3_000)
    expect(controller.diagnostics.freezeOutput(2_000, { confirm: true })).toEqual({ ok: true })
    await advanceAsync(clock, 500)
    expect(frame()[SMOKE - 1]).toBe(180)

    // Fin du gel : la fumée est désarmée, un humain doit la réautoriser.
    await advanceAsync(clock, 2_000)
    expect(frame()[SMOKE - 1]).toBe(0)
    expect(controller.getState().smoke.armed).toBe(false)
    await controller.stop()
  })

  it('arrêter ou désarmer la fumée pendant un gel coupe tout de suite', async () => {
    for (const action of ['stop', 'disarm'] as const) {
      const { controller, clock, frame } = await setup()
      controller.diagnostics.begin()
      controller.smoke.arm()
      controller.smoke.fire(3_000)
      controller.diagnostics.freezeOutput(10_000, { confirm: true })
      await advanceAsync(clock, 300)
      expect(frame()[SMOKE - 1]).toBe(180)
      controller.smoke[action]()
      await advanceAsync(clock, 100)
      expect(controller.diagnostics.getState().frozenUntil).toBeNull()
      expect(frame()[SMOKE - 1]).toBe(0)
      await controller.stop()
    }
  })

  it('l’arrêt d’urgence annule le gel et bloque le diagnostic', async () => {
    const { controller, clock, output, frame } = await setup()
    controller.diagnostics.begin()
    controller.smoke.arm()
    controller.smoke.fire(3_000)
    await advanceAsync(clock, 100)
    controller.diagnostics.freezeOutput(10_000, { confirm: true })
    controller.emergencyStop()
    await advanceAsync(clock, 100)
    expect(frame().every((value) => value === 0)).toBe(true)
    expect(output.framesSent()).toBeGreaterThan(0)
    expect(controller.diagnostics.getState().frozenUntil).toBeNull()
    expect(controller.diagnostics.setChannel(1, 1)).toEqual({ ok: false, reason: 'emergency' })
    expect(controller.diagnostics.freezeOutput(1_000, { confirm: true }).ok).toBe(false)
    expect(controller.diagnostics.begin()).toEqual({ ok: false, reason: 'emergency' })
    await controller.stop()
  })

  it('se termine tout seul après une longue inactivité, ou à la demande', async () => {
    const { controller, clock } = await setup()
    controller.diagnostics.begin()
    // Saut dans le temps : simuler 10 minutes de ticks un par un serait trop long.
    await advanceAsync(clock, 100)
    expect(controller.diagnostics.getState().active).toBe(true)
    clock.jump(DIAGNOSTICS_IDLE_MS)
    await advanceAsync(clock, 100)
    expect(controller.diagnostics.getState().active).toBe(false)
    expect(controller.getState().currentSceneId).toBe(SCENE_IDS.IDLE)

    controller.diagnostics.begin()
    controller.diagnostics.end()
    controller.diagnostics.end()
    expect(controller.diagnostics.getState().active).toBe(false)
    await controller.stop()
  })
})
