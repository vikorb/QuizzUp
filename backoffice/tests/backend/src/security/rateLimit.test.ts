import { describe, expect, it } from 'vitest'

import { createRateLimiter } from '@backend/security/rateLimit'

/** Horloge simulée : on la fait avancer à la main, aucune attente réelle. */
function fakeClock(start = 1_000_000) {
  let current = start

  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms
    },
  }
}

describe('security/rateLimit — fenêtre', () => {
  it('accepts up to max hits then refuses with the time left', () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ max: 3, windowMs: 60_000, now: clock.now })

    expect(limiter.hit('1.2.3.4').allowed).toBe(true)
    expect(limiter.hit('1.2.3.4').allowed).toBe(true)
    expect(limiter.hit('1.2.3.4').allowed).toBe(true)

    clock.advance(10_000)
    expect(limiter.hit('1.2.3.4')).toEqual({ allowed: false, retryAfterSeconds: 50 })
  })

  it('starts a fresh window once the previous one has elapsed', () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: clock.now })

    limiter.hit('1.2.3.4')
    clock.advance(59_999)
    expect(limiter.hit('1.2.3.4')).toEqual({ allowed: false, retryAfterSeconds: 1 })

    clock.advance(1)
    expect(limiter.hit('1.2.3.4').allowed).toBe(true)
    expect(limiter.hit('1.2.3.4').allowed).toBe(false)
  })

  it('does not extend the window when a refused hit comes in', () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: clock.now })

    limiter.hit('1.2.3.4')
    clock.advance(30_000)
    limiter.hit('1.2.3.4')
    clock.advance(30_000)

    expect(limiter.hit('1.2.3.4').allowed).toBe(true)
  })

  it('keeps addresses independent', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: fakeClock().now })

    expect(limiter.hit('1.2.3.4').allowed).toBe(true)
    expect(limiter.hit('1.2.3.4').allowed).toBe(false)
    expect(limiter.hit('5.6.7.8').allowed).toBe(true)
  })

  it('keeps suffixes of the same address independent', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: fakeClock().now })

    expect(limiter.hit('1.2.3.4', 'join').allowed).toBe(true)
    expect(limiter.hit('1.2.3.4', 'join').allowed).toBe(false)
    expect(limiter.hit('1.2.3.4', 'lookup').allowed).toBe(true)
    expect(limiter.hit('1.2.3.4').allowed).toBe(true)
  })
})

describe('security/rateLimit — refund', () => {
  it('gives a hit back inside the window', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: fakeClock().now })

    limiter.hit('1.2.3.4')
    limiter.refund('1.2.3.4')

    expect(limiter.hit('1.2.3.4').allowed).toBe(true)
    expect(limiter.hit('1.2.3.4').allowed).toBe(false)
  })

  it('ignores an unknown key, an expired window and an empty counter', () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: clock.now })

    limiter.refund('9.9.9.9')
    limiter.hit('1.2.3.4')
    clock.advance(60_000)
    limiter.refund('1.2.3.4')

    // Fenêtre neuve : un seul passage accepté, le refund tardif n'a rien donné en plus.
    expect(limiter.hit('1.2.3.4').allowed).toBe(true)
    expect(limiter.hit('1.2.3.4').allowed).toBe(false)

    limiter.refund('1.2.3.4')
    limiter.refund('1.2.3.4')
    expect(limiter.hit('1.2.3.4').allowed).toBe(true)
    expect(limiter.hit('1.2.3.4').allowed).toBe(false)
  })
})

describe('security/rateLimit — ménage', () => {
  it('drops expired entries so memory does not grow', () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ max: 5, windowMs: 60_000, now: clock.now })

    for (let i = 0; i < 100; i += 1) limiter.hit(`10.0.0.${i}`)
    expect(limiter.size()).toBe(100)

    clock.advance(60_000)
    limiter.hit('192.168.0.1')

    expect(limiter.size()).toBe(1)
  })

  it('keeps entries whose window is still running', () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ max: 5, windowMs: 60_000, now: clock.now })

    limiter.hit('1.2.3.4')
    clock.advance(30_000)
    limiter.hit('5.6.7.8')
    clock.advance(30_000)
    limiter.hit('9.9.9.9')

    // Le ménage a retiré la première fenêtre (terminée) mais pas la deuxième (encore ouverte).
    expect(limiter.size()).toBe(2)
  })
})
