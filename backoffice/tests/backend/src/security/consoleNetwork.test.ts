import { describe, expect, it } from 'vitest'

import {
  consoleNetworkWarnings,
  createConsoleNetwork,
} from '../../../../backend/src/security/consoleNetwork'

// Plages de documentation (RFC 5737 et 3849) : aucune adresse réelle.
describe('security/consoleNetwork createConsoleNetwork', () => {
  it('allows the addresses of an IPv4 range and refuses the others', () => {
    const { allows } = createConsoleNetwork('192.0.2.0/24')

    expect(allows('192.0.2.1')).toBe(true)
    expect(allows('192.0.2.254')).toBe(true)
    expect(allows('192.0.3.1')).toBe(false)
    expect(allows('198.51.100.9')).toBe(false)
  })

  it('reads a bare address as a single host', () => {
    const { allows } = createConsoleNetwork('192.0.2.7 2001:db8::7')

    expect(allows('192.0.2.7')).toBe(true)
    expect(allows('192.0.2.8')).toBe(false)
    expect(allows('2001:db8::7')).toBe(true)
    expect(allows('2001:db8::8')).toBe(false)
  })

  it('handles IPv6 ranges, in any spelling of the same address', () => {
    const { allows } = createConsoleNetwork('2001:db8::/32')

    expect(allows('2001:db8::1')).toBe(true)
    expect(allows('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe(true)
    expect(allows('2001:db8:ffff:ffff::1')).toBe(true)
    expect(allows('2001:db9::1')).toBe(false)
    expect(allows('3fff::1')).toBe(false)
  })

  it('matches an IPv4-mapped IPv6 address against the IPv4 ranges, in both spellings', () => {
    const { allows } = createConsoleNetwork('192.0.2.0/24')

    expect(allows('::ffff:192.0.2.9')).toBe(true)
    expect(allows('::ffff:c000:209')).toBe(true)
    expect(allows('::ffff:198.51.100.9')).toBe(false)
  })

  it('does not let an IPv4 range open the matching IPv6 addresses, nor the other way round', () => {
    expect(createConsoleNetwork('192.0.2.0/24').allows('2001:db8::1')).toBe(false)
    expect(createConsoleNetwork('2001:db8::/32').allows('192.0.2.1')).toBe(false)
  })

  it.each(['::/0', '::/1', '::ffff:0:0/96', '::ffff:c000:200/120', '::/96'])(
    'never lets the IPv6 range %s open an IPv4 or IPv4-mapped address',
    (range) => {
      const { allows } = createConsoleNetwork(range)

      expect(allows('192.0.2.1')).toBe(false)
      expect(allows('::ffff:192.0.2.1')).toBe(false)
      expect(allows('::ffff:c000:201')).toBe(false)
      expect(allows('0:0:0:0:0:ffff:c000:201')).toBe(false)
    }
  )

  it('keeps ::/0 open to every native IPv6 address', () => {
    const { allows } = createConsoleNetwork('::/0')

    expect(allows('2001:db8::1')).toBe(true)
    expect(allows('::1')).toBe(true)
  })

  it('never lets 0.0.0.0/0 open an IPv6 address', () => {
    const { allows } = createConsoleNetwork('0.0.0.0/0')

    expect(allows('2001:db8::1')).toBe(false)
    expect(allows('::1')).toBe(false)
    expect(allows('192.0.2.1')).toBe(true)
    expect(allows('::ffff:192.0.2.1')).toBe(true)
  })

  it('ignores the zone of an address', () => {
    expect(createConsoleNetwork('fe80::/10').allows('fe80::1%eth0')).toBe(true)
  })

  it('refuses an address that is not an IP address', () => {
    const { allows } = createConsoleNetwork('0.0.0.0/0 ::/0')

    expect(allows('')).toBe(false)
    expect(allows('unknown')).toBe(false)
    expect(allows('192.0.2.1, 198.51.100.9')).toBe(false)
  })

  it('opens everything for 0.0.0.0/0 and ::/0 (demo compose, ports bound to localhost)', () => {
    const { allows } = createConsoleNetwork('0.0.0.0/0 ::/0')

    expect(allows('198.51.100.9')).toBe(true)
    expect(allows('2001:db8::1')).toBe(true)
    expect(allows('::ffff:198.51.100.9')).toBe(true)
  })

  it.each([undefined, '', '   ', ' , '])('is closed when the value is %j', (value) => {
    const network = createConsoleNetwork(value)

    expect(network.ranges).toEqual([])
    expect(network.allows('127.0.0.1')).toBe(false)
    expect(network.allows('::1')).toBe(false)
    expect(network.allows('192.0.2.1')).toBe(false)
  })

  it('accepts entries separated by spaces, by commas, or both, and keeps them in order', () => {
    const expected = ['192.0.2.0/24', '198.51.100.7/32', '2001:db8::/32']

    expect(createConsoleNetwork('192.0.2.0/24 198.51.100.7/32 2001:db8::/32').ranges).toEqual(
      expected
    )
    expect(createConsoleNetwork('192.0.2.0/24,198.51.100.7/32,2001:db8::/32').ranges).toEqual(
      expected
    )
    expect(
      createConsoleNetwork(' 192.0.2.0/24 ,198.51.100.7/32,\t2001:db8::/32 \n').ranges
    ).toEqual(expected)
    expect(createConsoleNetwork('192.0.2.0/24, 198.51.100.7/32').allows('198.51.100.7')).toBe(true)
  })

  it('allows the default local-development value', () => {
    const { allows } = createConsoleNetwork('127.0.0.1/32 ::1/128')

    expect(allows('127.0.0.1')).toBe(true)
    expect(allows('::1')).toBe(true)
    expect(allows('::ffff:127.0.0.1')).toBe(true)
    expect(allows('127.0.0.2')).toBe(false)
  })

  it.each([
    'pas-une-adresse',
    '192.0.2.0/33',
    '2001:db8::/129',
    '192.0.2.0/',
    '192.0.2.0/-1',
    '192.0.2.0/abc',
    '192.0.2.0/24/24',
    '192.0.2.256/24',
    '192.0.2/24',
    'fe80::1%eth0',
    '*',
    'true',
  ])('refuses the invalid entry %j with a message naming the variable and the entry', (entry) => {
    expect(() => createConsoleNetwork(`192.0.2.0/24 ${entry}`)).toThrow(
      /CONSOLE_ALLOWED_CIDRS invalide/
    )
    expect(() => createConsoleNetwork(`192.0.2.0/24 ${entry}`)).toThrow(entry)
  })
})

describe('security/consoleNetwork consoleNetworkWarnings', () => {
  it('stays silent for narrow ranges that do not touch the trusted proxies', () => {
    expect(
      consoleNetworkWarnings(['192.0.2.0/24', '2001:db8::/32', '127.0.0.1/32', '::1/128'], false)
    ).toEqual([])
    expect(
      consoleNetworkWarnings(['192.0.2.0/24', '2001:db8::/32'], ['172.18.0.0/16', 'fd00::/8'])
    ).toEqual([])
    expect(consoleNetworkWarnings([], ['172.18.0.0/16'])).toEqual([])
  })

  it.each(['0.0.0.0/0', '::/0'])(
    'warns about the range %s, which opens the console to the internet',
    (range) => {
      const warnings = consoleNetworkWarnings([range], false)

      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain(range)
    }
  )

  it('warns once per range for 0.0.0.0/0 ::/0 (demo compose)', () => {
    expect(consoleNetworkWarnings(['0.0.0.0/0', '::/0'], false)).toHaveLength(2)
  })

  it.each([
    ['198.51.100.0/24', '198.51.100.0/24'],
    ['198.51.100.7', '198.51.100.0/24'],
    ['198.51.100.0/24', '198.51.100.7'],
    ['198.51.0.0/16', '198.51.100.0/24'],
    ['2001:db8::/32', '2001:db8:1::/48'],
    ['2001:db8:1::5', '2001:db8::/32'],
  ])('warns when the console range %s overlaps the TRUST_PROXY range %s', (range, proxy) => {
    const warnings = consoleNetworkWarnings([range], [proxy])

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain(range)
    expect(warnings[0]).toContain('TRUST_PROXY')
    expect(warnings[0]).toContain(proxy)
  })

  it('does not mix the IPv4 and IPv6 families when looking for an overlap', () => {
    expect(consoleNetworkWarnings(['192.0.2.0/24'], ['2001:db8::/32'])).toEqual([])
    expect(consoleNetworkWarnings(['2001:db8::/32'], ['192.0.2.0/24'])).toEqual([])
  })

  it('does not warn for neighbouring ranges that share no address', () => {
    expect(consoleNetworkWarnings(['198.51.101.0/24'], ['198.51.100.0/24'])).toEqual([])
    expect(consoleNetworkWarnings(['2001:db9::/32'], ['2001:db8::/32'])).toEqual([])
  })
})
