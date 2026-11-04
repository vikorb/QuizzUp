import { browserClock } from '@hardware/clock'
import { createEmitter } from '@hardware/emitter'
import {
  buttonToIndex,
  clampByte,
  clampDeskCount,
  DEFAULT_DESK_COUNT,
  desksForCount,
  isBuzzerButton,
  isDesk,
} from '@hardware/types'

describe('outils de base', () => {
  it('horloge navigateur : base performance.now() et minuteurs natifs', async () => {
    expect(Math.abs(browserClock.now() - performance.now())).toBeLessThan(50)
    const timeout = vi.fn()
    const interval = vi.fn()
    browserClock.setTimeout(timeout, 0)
    const handle = browserClock.setInterval(interval, 1)
    browserClock.clearTimeout(browserClock.setTimeout(timeout, 0))
    await new Promise((resolve) => setTimeout(resolve, 20))
    browserClock.clearInterval(handle)
    expect(timeout).toHaveBeenCalledTimes(1)
    expect(interval).toHaveBeenCalled()
  })

  it('émetteur : abonnement, désabonnement, vidage', () => {
    const emitter = createEmitter<number>()
    const listener = vi.fn()
    const off = emitter.on(listener)
    emitter.on(() => undefined)
    expect(emitter.size()).toBe(2)
    emitter.emit(1)
    off()
    emitter.emit(2)
    expect(listener).toHaveBeenCalledTimes(1)
    emitter.clear()
    expect(emitter.size()).toBe(0)
  })

  it('types : gardes et conversions', () => {
    expect(isDesk(4)).toBe(true)
    expect(isDesk(0)).toBe(false)
    expect(isDesk('1')).toBe(false)
    expect(isBuzzerButton('D')).toBe(true)
    expect(isBuzzerButton('E')).toBe(false)
    expect(buttonToIndex('A')).toBe(0)
    expect(buttonToIndex('D')).toBe(3)
    expect(clampByte(Number.NaN)).toBe(0)
    expect(clampByte(-3)).toBe(0)
    expect(clampByte(300)).toBe(255)
    expect(clampByte(12.6)).toBe(13)
  })

  it('compte les pupitres d’une salle : 4 par défaut, de 1 à 6', () => {
    expect(DEFAULT_DESK_COUNT).toBe(4)
    expect(clampDeskCount(undefined)).toBe(4)
    expect(clampDeskCount('5')).toBe(4)
    expect(clampDeskCount(Number.NaN)).toBe(4)
    expect(clampDeskCount(0)).toBe(1)
    expect(clampDeskCount(3.9)).toBe(3)
    expect(clampDeskCount(6)).toBe(6)
    expect(clampDeskCount(7)).toBe(6)
    expect(desksForCount(2)).toEqual([1, 2])
    expect(desksForCount(6)).toEqual([1, 2, 3, 4, 5, 6])
    expect(desksForCount(undefined)).toEqual([1, 2, 3, 4])
  })
})
