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
    expect(parseTrustProxy(' 172.18.0.0/16 , 10.0.0.5,::1, fd00::/8 ')).toEqual([
      '172.18.0.0/16',
      '10.0.0.5',
      '::1',
      'fd00::/8',
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
