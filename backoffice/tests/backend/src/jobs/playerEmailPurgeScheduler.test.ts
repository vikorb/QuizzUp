import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_PLAYER_EMAIL_PURGE_INTERVAL_HOURS,
  MIN_PLAYER_EMAIL_PURGE_INTERVAL_HOURS,
  PLAYER_EMAIL_PURGE_INITIAL_DELAY_MS,
  parsePlayerEmailPurgeIntervalHours,
  startPlayerEmailPurgeScheduler,
} from '@backend/jobs/playerEmailPurgeScheduler'

const HOUR_MS = 60 * 60 * 1000

describe('parsePlayerEmailPurgeIntervalHours', () => {
  it('vaut 24 h par défaut', () => {
    expect(DEFAULT_PLAYER_EMAIL_PURGE_INTERVAL_HOURS).toBe(24)
    expect(parsePlayerEmailPurgeIntervalHours(undefined)).toBe(24)
    expect(parsePlayerEmailPurgeIntervalHours('')).toBe(24)
    expect(parsePlayerEmailPurgeIntervalHours('   ')).toBe(24)
  })

  it('lit une valeur en heures', () => {
    expect(parsePlayerEmailPurgeIntervalHours('6')).toBe(6)
    expect(parsePlayerEmailPurgeIntervalHours(' 12 ')).toBe(12)
    expect(parsePlayerEmailPurgeIntervalHours('1')).toBe(1)
    expect(parsePlayerEmailPurgeIntervalHours('1.5')).toBe(1.5)
  })

  it('retombe sur 24 h pour une valeur positive inférieure à 1 h', () => {
    expect(MIN_PLAYER_EMAIL_PURGE_INTERVAL_HOURS).toBe(1)
    expect(parsePlayerEmailPurgeIntervalHours('0.5')).toBe(24)
    expect(parsePlayerEmailPurgeIntervalHours('0.001')).toBe(24)
    expect(parsePlayerEmailPurgeIntervalHours('0.99')).toBe(24)
  })

  it('0 désactive la purge', () => {
    expect(parsePlayerEmailPurgeIntervalHours('0')).toBe(0)
  })

  it('retombe sur 24 h si la valeur est invalide ou négative', () => {
    expect(parsePlayerEmailPurgeIntervalHours('abc')).toBe(24)
    expect(parsePlayerEmailPurgeIntervalHours('-3')).toBe(24)
    expect(parsePlayerEmailPurgeIntervalHours('Infinity')).toBe(24)
  })
})

describe('startPlayerEmailPurgeScheduler', () => {
  const log = { info: vi.fn(), error: vi.fn() }
  const purge = vi.fn<() => Promise<number>>()

  beforeEach(() => {
    vi.useFakeTimers()
    log.info.mockReset()
    log.error.mockReset()
    purge.mockReset()
    purge.mockResolvedValue(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('n’arme aucun minuteur quand l’intervalle est 0', async () => {
    const stop = startPlayerEmailPurgeScheduler({ purge, log, intervalHours: 0 })

    expect(vi.getTimerCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(48 * HOUR_MS)

    expect(purge).not.toHaveBeenCalled()
    expect(log.info).toHaveBeenCalledTimes(1)
    expect(() => stop()).not.toThrow()
  })

  it('n’arme aucun minuteur pour un intervalle négatif ou invalide', () => {
    startPlayerEmailPurgeScheduler({ purge, log, intervalHours: -1 })
    startPlayerEmailPurgeScheduler({ purge, log, intervalHours: Number.NaN })

    expect(vi.getTimerCount()).toBe(0)
  })

  it('lance une première purge peu après le démarrage, pas immédiatement', async () => {
    const stop = startPlayerEmailPurgeScheduler({ purge, log, intervalHours: 24 })

    expect(purge).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(PLAYER_EMAIL_PURGE_INITIAL_DELAY_MS - 1)
    expect(purge).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(purge).toHaveBeenCalledTimes(1)

    stop()
  })

  it('relance ensuite la purge à chaque intervalle', async () => {
    const stop = startPlayerEmailPurgeScheduler({ purge, log, intervalHours: 24 })

    await vi.advanceTimersByTimeAsync(PLAYER_EMAIL_PURGE_INITIAL_DELAY_MS)
    expect(purge).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(24 * HOUR_MS)
    expect(purge).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(24 * HOUR_MS)
    expect(purge).toHaveBeenCalledTimes(3)

    stop()
  })

  it('respecte le délai initial fourni et un intervalle fractionnaire', async () => {
    const stop = startPlayerEmailPurgeScheduler({
      purge,
      log,
      intervalHours: 0.5,
      initialDelayMs: 1000,
    })

    await vi.advanceTimersByTimeAsync(1000)
    expect(purge).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(HOUR_MS / 2)
    expect(purge).toHaveBeenCalledTimes(2)

    stop()
  })

  it('journalise le nombre de lignes purgées', async () => {
    purge.mockResolvedValue(7)
    const stop = startPlayerEmailPurgeScheduler({
      purge,
      log,
      intervalHours: 24,
      initialDelayMs: 10,
    })

    await vi.advanceTimersByTimeAsync(10)

    expect(log.info).toHaveBeenCalledWith({ purged: 7 }, expect.stringContaining('Purge RGPD'))

    stop()
  })

  it('journalise une erreur sans lever et poursuit aux échéances suivantes', async () => {
    const failure = new Error('base indisponible')
    purge.mockRejectedValueOnce(failure).mockResolvedValue(2)
    const stop = startPlayerEmailPurgeScheduler({
      purge,
      log,
      intervalHours: 1,
      initialDelayMs: 10,
    })

    await vi.advanceTimersByTimeAsync(10)

    expect(log.error).toHaveBeenCalledWith({ err: failure }, expect.stringContaining('échec'))

    await vi.advanceTimersByTimeAsync(HOUR_MS)

    expect(purge).toHaveBeenCalledTimes(2)
    expect(log.info).toHaveBeenCalledWith({ purged: 2 }, expect.any(String))

    stop()
  })

  it('ne lance pas deux purges en parallèle', async () => {
    let release: (value: number) => void = () => undefined
    purge.mockReturnValueOnce(new Promise<number>((resolve) => (release = resolve)))
    const stop = startPlayerEmailPurgeScheduler({
      purge,
      log,
      intervalHours: 0.001,
      initialDelayMs: 10,
    })

    await vi.advanceTimersByTimeAsync(10)
    await vi.advanceTimersByTimeAsync(0.001 * HOUR_MS * 3)

    expect(purge).toHaveBeenCalledTimes(1)

    release(1)
    await vi.advanceTimersByTimeAsync(0.001 * HOUR_MS)

    expect(purge).toHaveBeenCalledTimes(2)

    stop()
  })

  it('l’arrêt annule les minuteurs, avant et après la première purge', async () => {
    const stopBefore = startPlayerEmailPurgeScheduler({ purge, log, intervalHours: 24 })
    stopBefore()

    await vi.advanceTimersByTimeAsync(48 * HOUR_MS)
    expect(purge).not.toHaveBeenCalled()

    const stopAfter = startPlayerEmailPurgeScheduler({ purge, log, intervalHours: 24 })
    await vi.advanceTimersByTimeAsync(PLAYER_EMAIL_PURGE_INITIAL_DELAY_MS)
    expect(purge).toHaveBeenCalledTimes(1)

    stopAfter()
    expect(vi.getTimerCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(48 * HOUR_MS)
    expect(purge).toHaveBeenCalledTimes(1)
  })

  it('les minuteurs sont unref() : ils ne retiennent pas le processus', () => {
    const unref = vi.fn()
    const setTimeoutSpy = vi
      .spyOn(globalThis, 'setTimeout')
      .mockReturnValue({ unref, hasRef: () => true } as unknown as NodeJS.Timeout)
    const setIntervalSpy = vi
      .spyOn(globalThis, 'setInterval')
      .mockReturnValue({ unref, hasRef: () => true } as unknown as NodeJS.Timeout)

    startPlayerEmailPurgeScheduler({ purge, log, intervalHours: 24 })

    expect(unref).toHaveBeenCalledTimes(2)

    setTimeoutSpy.mockRestore()
    setIntervalSpy.mockRestore()
  })

  it('plafonne l’intervalle au maximum d’un minuteur Node', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    const stop = startPlayerEmailPurgeScheduler({ purge, log, intervalHours: 10_000 })

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 2_147_483_647)

    stop()
    setIntervalSpy.mockRestore()
  })
})
