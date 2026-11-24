import { WATCHDOG_STALL_MS } from '@hardware/lighting/lightingController'
import { SMOKE_HARD_LIMITS } from '@hardware/lighting/smoke'
import {
  BOARD_BAUD_RATE,
  BOARD_FIRE_INTERVAL_MS,
  BOARD_MAX_LEASE_MS,
  BOARD_MAX_LINE_BYTES,
  createLineSplitter,
  encodeBoardCommand,
  isBannerLine,
  parseBanner,
  parseStatusLine,
} from '@hardware/smoke/boardProtocol'

import { FAKE_BOARD_BANNER } from '../_helpers/fakeSmokeBoard'

const ascii = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0))

describe('bannière', () => {
  it('lit la bannière du protocole', () => {
    expect(parseBanner('QZF READY 1 1.0.0 10000 5000 500')).toEqual({
      ok: true,
      banner: { version: '1.0.0', maxFireMs: 10_000, cooldownMs: 5000, leaseMs: 500 },
    })
    expect(parseBanner(FAKE_BOARD_BANNER).ok).toBe(true)
  })

  it('accepte une carte plus stricte que les limites du projet', () => {
    expect(parseBanner('QZF READY 1 2.3.4 3000 30000 250')).toMatchObject({
      ok: true,
      banner: { maxFireMs: 3000, cooldownMs: 30_000, leaseMs: 250 },
    })
  })

  it('tolère des octets parasites avant la bannière, pas après', () => {
    expect(parseBanner('\u0000ÿQZF READY 1 1.0.0 10000 5000 500').ok).toBe(true)
    expect(parseBanner('QZF READY 1 1.0.0 10000 5000 500 x')).toEqual({
      ok: false,
      reason: 'invalid_values',
    })
    expect(isBannerLine('xx QZF READY 9')).toBe(true)
    expect(isBannerLine('S 0 READY CMD')).toBe(false)
  })

  it.each([
    ['', 'not_banner'],
    ['S 0 READY CMD', 'not_banner'],
    ['QZF READY', 'not_banner'],
    ['ABC READY 1 1.0.0 10000 5000 500', 'not_banner'],
    ['QZF READY 2 1.0.0 10000 5000 500', 'other_protocol'],
    ['QZF READY 0 1.0.0 10000 5000 500', 'invalid_values'],
    ['QZF READY x 1.0.0 10000 5000 500', 'invalid_values'],
    ['QZF READY 1 1.0.0 10000 5000', 'invalid_values'],
    ['QZF READY 1 1.0 10000 5000 500', 'invalid_values'],
    ['QZF READY 1 1.0.0 abc 5000 500', 'invalid_values'],
    ['QZF READY 1 1.0.0 10000 5000 5e2', 'invalid_values'],
    ['QZF READY 1 1.0.0 10000 5000 -500', 'invalid_values'],
    ['QZF READY 1 1.0.0 0 5000 500', 'invalid_values'],
    ['QZF READY 1 1.0.0 10000 5000 0', 'invalid_values'],
    ['QZF READY 1 1.0.0 010000 5000 500', 'invalid_values'],
    ['QZF READY 1 1.0.0 10000 5000 500.5', 'invalid_values'],
    ['QZF READY 1 1.0.0 1000000000 5000 500', 'invalid_values'],
    ['QZF  READY 1 1.0.0 10000 5000 500', 'not_banner'],
  ])('refuse %j (%s)', (line, reason) => {
    expect(parseBanner(line)).toEqual({ ok: false, reason })
  })

  it('refuse une carte plus permissive que SMOKE_HARD_LIMITS et le chien de garde', () => {
    const { maxDurationMs, minCooldownMs } = SMOKE_HARD_LIMITS
    const banner = (fire: number, cooldown: number, lease: number) =>
      parseBanner(`QZF READY 1 1.0.0 ${fire} ${cooldown} ${lease}`)
    // Valeurs égales aux limites : acceptées.
    expect(banner(maxDurationMs, minCooldownMs, WATCHDOG_STALL_MS).ok).toBe(true)
    // Un cran au-delà, une limite après l'autre : refusées.
    expect(banner(maxDurationMs + 1, minCooldownMs, WATCHDOG_STALL_MS)).toEqual({
      ok: false,
      reason: 'too_permissive',
    })
    expect(banner(maxDurationMs, minCooldownMs - 1, WATCHDOG_STALL_MS)).toEqual({
      ok: false,
      reason: 'too_permissive',
    })
    expect(banner(maxDurationMs, minCooldownMs, WATCHDOG_STALL_MS + 1)).toEqual({
      ok: false,
      reason: 'too_permissive',
    })
  })

  it('le bail maximal accepté est celui du chien de garde des lumières', () => {
    expect(BOARD_MAX_LEASE_MS).toBe(WATCHDOG_STALL_MS)
  })

  it('refuse un bail de moins de deux envois de F : il couperait entre deux ordres normaux', () => {
    const banner = (lease: number) => parseBanner(`QZF READY 1 1.0.0 10000 5000 ${lease}`)
    expect(banner(2 * BOARD_FIRE_INTERVAL_MS).ok).toBe(true)
    expect(banner(2 * BOARD_FIRE_INTERVAL_MS - 1)).toEqual({ ok: false, reason: 'invalid_values' })
    expect(banner(BOARD_FIRE_INTERVAL_MS)).toEqual({ ok: false, reason: 'invalid_values' })
  })
})

describe('ligne d’état', () => {
  it.each([
    ['S 0 READY CMD', { output: false, state: 'READY', cause: 'CMD' }],
    ['S 1 FIRE LEASE', { output: true, state: 'FIRE', cause: 'LEASE' }],
    ['S 0 COOL MAX', { output: false, state: 'COOL', cause: 'MAX' }],
    ['S 0 COOL BAD', { output: false, state: 'COOL', cause: 'BAD' }],
  ])('lit %s', (line, expected) => {
    expect(parseStatusLine(line)).toEqual(expected)
  })

  it.each([
    '',
    'S',
    'S 2 READY CMD',
    'S 1 FIRE',
    'S 1 FIRE LEASE ',
    's 1 FIRE LEASE',
    'S 1 FIRING LEASE',
    'S 1 FIRE OTHER',
    'S  1 FIRE LEASE',
    'S 1 FIRE LEASE extra',
    'QZF READY 1 1.0.0 10000 5000 500',
    // Incohérentes : la sortie n'est allumée que pendant un jet.
    'S 1 COOL LEASE',
    'S 1 READY CMD',
    'S 0 FIRE CMD',
  ])('refuse %j', (line) => {
    expect(parseStatusLine(line)).toBeNull()
  })
})

describe('commandes', () => {
  it('écrit la ligne exacte, terminée par un seul \\n', () => {
    expect([...encodeBoardCommand('fire')]).toEqual([0x46, 0x0a])
    expect([...encodeBoardCommand('off')]).toEqual([0x30, 0x0a])
    expect([...encodeBoardCommand('hello')]).toEqual([0x48, 0x0a])
  })

  it('fixe le débit à 9600 bauds', () => {
    expect(BOARD_BAUD_RATE).toBe(9600)
  })
})

describe('découpage en lignes', () => {
  it('découpe, ignore les lignes vides et tolère \\r\\n', () => {
    const splitter = createLineSplitter()
    expect(splitter.push(ascii('S 0 READY CMD\r\n\nS 1 FIRE LEASE\n'))).toEqual({
      lines: ['S 0 READY CMD', 'S 1 FIRE LEASE'],
      rejected: 0,
    })
  })

  it('recolle une ligne coupée entre deux paquets', () => {
    const splitter = createLineSplitter()
    expect(splitter.push(ascii('S 0 REA')).lines).toEqual([])
    expect(splitter.push(ascii('DY CMD\r')).lines).toEqual([])
    expect(splitter.push(ascii('\n')).lines).toEqual(['S 0 READY CMD'])
  })

  it('rejette une ligne trop longue en entier, même coupée en plusieurs paquets', () => {
    const splitter = createLineSplitter()
    const long = 'x'.repeat(BOARD_MAX_LINE_BYTES + 10)
    expect(splitter.push(ascii(long.slice(0, 40))).rejected).toBe(0)
    expect(splitter.push(ascii(`${long.slice(40)}\nS 0 READY CMD\n`))).toEqual({
      lines: ['S 0 READY CMD'],
      rejected: 1,
    })
  })

  it('accepte une ligne de la longueur maximale et rejette un octet de plus', () => {
    const splitter = createLineSplitter()
    const exact = 'y'.repeat(BOARD_MAX_LINE_BYTES)
    expect(splitter.push(ascii(`${exact}\n`)).lines).toEqual([exact])
    expect(splitter.push(ascii(`${exact}y\n`))).toEqual({ lines: [], rejected: 1 })
  })

  it('garde un tampon borné face à un flux sans fin de ligne', () => {
    const splitter = createLineSplitter(8)
    for (let index = 0; index < 100; index += 1) {
      expect(splitter.push(ascii('zzzzzzzzzz')).lines).toEqual([])
    }
    expect(splitter.push(ascii('\nok\n'))).toEqual({ lines: ['ok'], rejected: 1 })
  })

  it('lit un octet non ASCII comme un caractère que les lecteurs refusent', () => {
    const splitter = createLineSplitter()
    const { lines } = splitter.push(Uint8Array.from([0xff, 0x53, 0x0a]))
    expect(lines).toHaveLength(1)
    expect(parseStatusLine(lines[0] ?? '')).toBeNull()
  })
})
