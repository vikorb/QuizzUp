import { createRateLimiter, RATE_LIMIT_MAX_KEYS } from '@backend/security/rateLimit'
import { describe, expect, it } from 'vitest'

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
    expect(limiter.hit('1.2.3.4')).toEqual({ allowed: false, retryAfterSeconds: 50, remaining: 0 })
  })

  it('tells how many hits are left in the window, down to zero', () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 60_000, now: fakeClock().now })

    expect(limiter.hit('1.2.3.4').remaining).toBe(1)
    expect(limiter.hit('1.2.3.4').remaining).toBe(0)
    expect(limiter.hit('1.2.3.4').remaining).toBe(0)
  })

  it('peeks without counting, and refuses once the window is full', () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ max: 2, windowMs: 60_000, now: clock.now })

    expect(limiter.peek('1.2.3.4')).toEqual({ allowed: true, retryAfterSeconds: 60, remaining: 2 })
    expect(limiter.peek('1.2.3.4').remaining).toBe(2)

    limiter.hit('1.2.3.4')
    limiter.hit('1.2.3.4')
    clock.advance(10_000)
    expect(limiter.peek('1.2.3.4')).toEqual({ allowed: false, retryAfterSeconds: 50, remaining: 0 })

    clock.advance(50_000)
    expect(limiter.peek('1.2.3.4').allowed).toBe(true)
  })

  it('starts a fresh window once the previous one has elapsed', () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: clock.now })

    limiter.hit('1.2.3.4')
    clock.advance(59_999)
    expect(limiter.hit('1.2.3.4')).toEqual({ allowed: false, retryAfterSeconds: 1, remaining: 0 })

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

describe('security/rateLimit — adresses IPv6', () => {
  it('counts every address of the same /64 together', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: fakeClock().now })

    expect(limiter.hit('2001:db8:1:2::1').allowed).toBe(true)
    expect(limiter.hit('2001:db8:1:2:aaaa:bbbb:cccc:dddd').allowed).toBe(false)
    expect(limiter.hit('2001:0DB8:0001:0002:0:0:0:9').allowed).toBe(false)
    expect(limiter.hit('2001:db8:1:2::1%eth0').allowed).toBe(false)
    expect(limiter.size()).toBe(1)
  })

  it('keeps two different /64 apart', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: fakeClock().now })

    expect(limiter.hit('2001:db8:1:2::1').allowed).toBe(true)
    expect(limiter.hit('2001:db8:1:3::1').allowed).toBe(true)
  })

  it('expands the compressed forms before cutting at 64 bits', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: fakeClock().now })

    // `1::2:3:4:5:6:7` vaut 1:0:2:3:4:5:6:7 : le /64 est 1:0:2:3.
    expect(limiter.hit('1::2:3:4:5:6:7').allowed).toBe(true)
    expect(limiter.hit('1:0:2:3:ffff::1').allowed).toBe(false)
    expect(limiter.hit('::1').allowed).toBe(true)
    expect(limiter.hit('::2').allowed).toBe(false)
  })

  it('treats an IPv4-mapped address as the IPv4 address itself', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: fakeClock().now })

    expect(limiter.hit('::ffff:203.0.113.7').allowed).toBe(true)
    expect(limiter.hit('203.0.113.7').allowed).toBe(false)
    expect(limiter.hit('::ffff:cb00:7107').allowed).toBe(false)
    expect(limiter.hit('::ffff:203.0.113.8').allowed).toBe(true)
  })

  it('refunds on the same /64 key', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: fakeClock().now })

    limiter.hit('2001:db8:1:2::1')
    limiter.refund('2001:db8:1:2::ffff')

    expect(limiter.hit('2001:db8:1:2::5').allowed).toBe(true)
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

describe('security/rateLimit — plafond de la table', () => {
  it('never holds more than the maximum, evicting the oldest keys first', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: fakeClock().now })

    for (let i = 0; i < RATE_LIMIT_MAX_KEYS; i += 1) limiter.hit(`key-${i}`)
    expect(limiter.size()).toBe(RATE_LIMIT_MAX_KEYS)

    limiter.hit('one-more')
    expect(limiter.size()).toBe(RATE_LIMIT_MAX_KEYS)

    // La plus ancienne a été oubliée (compteur vide), la suivante est toujours suivie.
    expect(limiter.hit('key-1').allowed).toBe(false)
    expect(limiter.hit('key-0').allowed).toBe(true)
    expect(limiter.size()).toBe(RATE_LIMIT_MAX_KEYS)
  })
})
