import {
  createSmokeController,
  DEFAULT_SMOKE_SAFETY,
  normalizeSmokeSafety,
  SMOKE_HARD_LIMITS,
} from '@hardware/lighting/smoke'

import { createManualClock } from '../_helpers/manualClock'

const enabled = { enabled: true, maxDurationMs: 2_000, cooldownMs: 10_000, maxLevel: 200 }

describe('normalizeSmokeSafety', () => {
  it('désactive la fumée et exige la confirmation par défaut', () => {
    expect(normalizeSmokeSafety()).toEqual(DEFAULT_SMOKE_SAFETY)
  })

  it('applique les limites codées en dur', () => {
    const config = normalizeSmokeSafety({
      enabled: true,
      maxDurationMs: 60_000,
      cooldownMs: 0,
      maxLevel: 999,
      requireConfirmation: false,
    })
    expect(config).toEqual({
      enabled: true,
      maxDurationMs: SMOKE_HARD_LIMITS.maxDurationMs,
      cooldownMs: SMOKE_HARD_LIMITS.minCooldownMs,
      maxLevel: 255,
      requireConfirmation: false,
    })
    expect(normalizeSmokeSafety({ maxDurationMs: 10, cooldownMs: 1e9, maxLevel: 0 })).toMatchObject(
      {
        maxDurationMs: SMOKE_HARD_LIMITS.minDurationMs,
        cooldownMs: SMOKE_HARD_LIMITS.maxCooldownMs,
        maxLevel: 1,
      }
    )
    expect(normalizeSmokeSafety({ maxDurationMs: Number.NaN }).maxDurationMs).toBe(3_000)
  })
})

describe('contrôleur de fumée', () => {
  it('refuse tout quand la fumée est désactivée', () => {
    const smoke = createSmokeController({ clock: createManualClock() })
    expect(smoke.arm()).toBe(false)
    expect(smoke.fire(1_000)).toEqual({ ok: false, reason: 'disabled' })
    expect(smoke.getState().status).toBe('disabled')
    expect(smoke.level()).toBe(0)
  })

  it('exige l’armement par un humain', () => {
    const clock = createManualClock()
    const smoke = createSmokeController({ config: enabled, clock })
    expect(smoke.getState().status).toBe('unarmed')
    expect(smoke.fire(1_000)).toEqual({ ok: false, reason: 'not_armed' })
    expect(smoke.arm()).toBe(true)
    expect(smoke.arm()).toBe(true)
    expect(smoke.getState().status).toBe('ready')
  })

  it('est prête sans armement si la confirmation est retirée', () => {
    const smoke = createSmokeController({
      config: { ...enabled, requireConfirmation: false },
      clock: createManualClock(),
    })
    expect(smoke.getState().status).toBe('ready')
  })

  it('borne la durée, coupe seule puis impose la pause', () => {
    const clock = createManualClock()
    const smoke = createSmokeController({ config: enabled, clock })
    const changes = vi.fn()
    smoke.onChange(changes)
    smoke.arm()

    expect(smoke.fire(60_000)).toEqual({ ok: true, durationMs: 2_000 })
    expect(smoke.level()).toBe(200)
    expect(smoke.fire(500)).toEqual({ ok: false, reason: 'firing' })

    clock.advance(1_999)
    expect(smoke.level()).toBe(200)
    clock.advance(1)
    expect(smoke.level()).toBe(0)
    expect(smoke.getState()).toMatchObject({ status: 'cooldown', cooldownUntil: 13_000 })
    expect(smoke.fire(500)).toEqual({ ok: false, reason: 'cooldown' })

    clock.advance(10_000)
    expect(smoke.level()).toBe(0)
    expect(smoke.getState().status).toBe('ready')
    expect(changes).toHaveBeenCalled()
  })

  it('applique une durée minimale et refuse une durée invalide', () => {
    const smoke = createSmokeController({ config: enabled, clock: createManualClock() })
    smoke.arm()
    expect(smoke.fire(0)).toEqual({ ok: false, reason: 'invalid_duration' })
    expect(smoke.fire(Number.POSITIVE_INFINITY)).toEqual({ ok: false, reason: 'invalid_duration' })
    expect(smoke.fire(10)).toEqual({ ok: true, durationMs: SMOKE_HARD_LIMITS.minDurationMs })
  })

  it('ne prolonge jamais la fumée même si personne ne rappelle le contrôleur', () => {
    const clock = createManualClock()
    const smoke = createSmokeController({ config: enabled, clock })
    smoke.arm()
    smoke.fire(2_000)
    clock.jump(60_000)
    expect(smoke.level()).toBe(0)
  })

  it('coupe sur demande et démarre la pause', () => {
    const clock = createManualClock()
    const smoke = createSmokeController({ config: enabled, clock })
    smoke.arm()
    smoke.fire(2_000)
    clock.advance(500)
    smoke.stop('watchdog')
    expect(smoke.getState()).toMatchObject({
      status: 'cooldown',
      lastStopReason: 'watchdog',
      cooldownUntil: 11_500,
    })
    smoke.stop()
    expect(smoke.getState().lastStopReason).toBe('watchdog')
  })

  it('désarme et coupe une émission en cours', () => {
    const clock = createManualClock()
    const smoke = createSmokeController({ config: enabled, clock })
    smoke.arm()
    smoke.fire(2_000)
    smoke.disarm()
    expect(smoke.level()).toBe(0)
    expect(smoke.getState()).toMatchObject({ armed: false, lastStopReason: 'disarmed' })
    smoke.disarm()
  })

  it('verrouille après arrêt d’urgence jusqu’au réarmement', () => {
    const clock = createManualClock()
    const smoke = createSmokeController({ config: enabled, clock })
    smoke.arm()
    smoke.fire(2_000)
    smoke.emergencyStop()
    expect(smoke.level()).toBe(0)
    expect(smoke.getState().status).toBe('emergency')
    expect(smoke.arm()).toBe(false)
    expect(smoke.fire(1_000)).toEqual({ ok: false, reason: 'emergency' })

    smoke.resetEmergency()
    smoke.resetEmergency()
    // Après réarmement : la pause court toujours et il faut réarmer à la main.
    expect(smoke.getState()).toMatchObject({ status: 'cooldown', armed: false })
    clock.advance(10_000)
    expect(smoke.getState().status).toBe('unarmed')
  })

  it('réarme directement après urgence quand la confirmation est retirée', () => {
    const clock = createManualClock()
    const smoke = createSmokeController({
      config: { ...enabled, requireConfirmation: false },
      clock,
    })
    smoke.emergencyStop()
    smoke.resetEmergency()
    expect(smoke.getState().status).toBe('ready')
  })
})
