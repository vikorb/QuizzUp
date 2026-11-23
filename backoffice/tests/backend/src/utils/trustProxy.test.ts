import fastify from 'fastify'
import { describe, expect, it } from 'vitest'

import { parseTrustProxy } from '../../../../backend/src/utils/trustProxy'

describe('utils/trustProxy parseTrustProxy', () => {
  it('keeps the socket address when unset or empty', () => {
    expect(parseTrustProxy(undefined)).toBe(false)
    expect(parseTrustProxy('')).toBe(false)
    expect(parseTrustProxy(' , ')).toBe(false)
  })

  it('accepts addresses and CIDR ranges, IPv4 and IPv6, and trims blanks', () => {
    expect(parseTrustProxy(' 172.18.0.0/16 , 10.0.0.5,::1, fd00::/16 ')).toEqual([
      '172.18.0.0/16',
      '10.0.0.5',
      '::1',
      'fd00::/16',
    ])
  })

  it.each(['true', 'TRUE', '*', 'false', '1', 'loopback', 'caddy', '0.0.0.0/0', '::/0', '0/0'])(
    'refuses %s with a clear message',
    (value) => {
      expect(() => parseTrustProxy(value)).toThrow(/TRUST_PROXY invalide/)
    }
  )

  it('refuses a broken range, even when the rest of the list is fine', () => {
    expect(() => parseTrustProxy('10.0.0.0/33')).toThrow(/préfixe CIDR hors limites/)
    expect(() => parseTrustProxy('fd00::/129')).toThrow(/préfixe CIDR hors limites/)
    expect(() => parseTrustProxy('10.0.0.0/8/8')).toThrow(/TRUST_PROXY invalide/)
    expect(() => parseTrustProxy('10.0.0.0/8,true')).toThrow(/« true »/)
  })

  it.each(['0.0.0.0/1,128.0.0.0/1', '1.0.0.0/7', '::/1', '8000::/15', '::ffff:0:0/96', '::/8'])(
    'refuses the range %s, too wide to be a proxy network',
    (value) => {
      expect(() => parseTrustProxy(value)).toThrow(/TRUST_PROXY invalide/)
    }
  )

  it('explains why a range is refused', () => {
    expect(() => parseTrustProxy('10.0.0.0/7')).toThrow(/au moins \/8 en IPv4/)
    expect(() => parseTrustProxy('fd00::/15')).toThrow(/au moins \/16 en IPv6/)
    expect(() => parseTrustProxy('::ffff:0:0/96')).toThrow(/IPv4 \(::ffff:0:0\/96\)/)
    expect(() => parseTrustProxy('::ffff:0:0/80')).toThrow(/IPv4 \(::ffff:0:0\/96\)/)
  })

  it('accepts the narrowest ranges allowed and single mapped addresses', () => {
    expect(parseTrustProxy('10.0.0.0/8,2001::/16,::ffff:172.18.0.2,::ffff:0:0/112')).toHaveLength(4)
  })

  it('refuses an address with a zone', () => {
    expect(() => parseTrustProxy('fe80::1%eth0')).toThrow(/zone/)
    expect(() => parseTrustProxy('fe80::%eth0/64')).toThrow(/zone/)
  })

  it('explains that an all-internet range trusts everyone', () => {
    expect(() => parseTrustProxy('0.0.0.0/0')).toThrow(/tout le monde/)
  })
})

describe('utils/trustProxy — adresse vue par Fastify (req.ip)', () => {
  async function clientIp(trustProxy: string | undefined, peer: string, forwarded: string) {
    const app = fastify({ logger: false, trustProxy: parseTrustProxy(trustProxy) })
    app.get('/ip', async (req) => ({ ip: req.ip }))

    const response = await app.inject({
      method: 'GET',
      url: '/ip',
      remoteAddress: peer,
      headers: { 'x-forwarded-for': forwarded },
    })
    await app.close()

    return response.json<{ ip: string }>().ip
  }

  it('ignores X-Forwarded-For when TRUST_PROXY is unset', async () => {
    expect(await clientIp(undefined, '172.18.0.2', '203.0.113.7')).toBe('172.18.0.2')
  })

  it('reads the client address when the direct peer is a trusted proxy', async () => {
    expect(await clientIp('172.18.0.0/16', '172.18.0.2', '203.0.113.7')).toBe('203.0.113.7')
  })

  it('ignores a forged header sent by a peer that is not a trusted proxy', async () => {
    expect(await clientIp('172.18.0.0/16', '198.51.100.9', '203.0.113.7')).toBe('198.51.100.9')
  })

  it('stops at the first untrusted hop of the chain, read from the right', async () => {
    // Le client a forgé 1.1.1.1 ; Caddy a ajouté l'adresse réelle 203.0.113.7 à droite.
    expect(await clientIp('172.18.0.0/16', '172.18.0.2', '1.1.1.1, 203.0.113.7')).toBe(
      '203.0.113.7'
    )
  })
})
