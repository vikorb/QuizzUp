import { randomBytes } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import {
  DEV_TOTP_ENCRYPTION_KEY,
  openSecret,
  parseTotpKey,
  sealSecret,
} from '../../../../backend/src/security/secretBox'

const KEY = randomBytes(32)
const SECRET = 'JBSWY3DPEHPK3PXP'

function flip(base64: string): string {
  const bytes = Buffer.from(base64, 'base64')
  bytes[0] ^= 1

  return bytes.toString('base64')
}

describe('security/secretBox.ts — chiffrement des secrets', () => {
  it('chiffre puis déchiffre à l’identique, au format v1.<iv>.<tag>.<chiffré>', () => {
    const sealed = sealSecret(KEY, 7, SECRET)

    expect(sealed).toMatch(/^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/)
    expect(sealed).not.toContain(SECRET)
    expect(openSecret(KEY, 7, sealed)).toBe(SECRET)
  })

  it('ne chiffre jamais deux fois pareil (vecteur d’initialisation neuf)', () => {
    expect(sealSecret(KEY, 7, SECRET)).not.toBe(sealSecret(KEY, 7, SECRET))
  })

  it('refuse un chiffré recopié sur l’admin d’un autre', () => {
    const sealed = sealSecret(KEY, 7, SECRET)

    expect(() => openSecret(KEY, 8, sealed)).toThrow()
  })

  it('refuse une autre clé', () => {
    expect(() => openSecret(randomBytes(32), 7, sealSecret(KEY, 7, SECRET))).toThrow()
  })

  it('refuse un chiffré altéré, dans le contenu, le tag ou le vecteur', () => {
    const [version, iv, tag, encrypted] = sealSecret(KEY, 7, SECRET).split('.')

    expect(() => openSecret(KEY, 7, [version, iv, tag, flip(encrypted)].join('.'))).toThrow()
    expect(() => openSecret(KEY, 7, [version, iv, flip(tag), encrypted].join('.'))).toThrow()
    expect(() => openSecret(KEY, 7, [version, flip(iv), tag, encrypted].join('.'))).toThrow()
  })

  it('refuse un tag tronqué, une version inconnue et un format cassé', () => {
    const [version, iv, tag, encrypted] = sealSecret(KEY, 7, SECRET).split('.')
    const shortTag = Buffer.from(tag, 'base64').subarray(0, 4).toString('base64')

    expect(() => openSecret(KEY, 7, [version, iv, shortTag, encrypted].join('.'))).toThrow()
    expect(() => openSecret(KEY, 7, ['v2', iv, tag, encrypted].join('.'))).toThrow()
    expect(() => openSecret(KEY, 7, `${version}.${iv}.${tag}`)).toThrow()
    expect(() => openSecret(KEY, 7, `${version}.${iv}.${tag}.${encrypted}.x`)).toThrow()
    expect(() => openSecret(KEY, 7, '')).toThrow()
  })
})

describe('security/secretBox.ts — clé de chiffrement', () => {
  it('lit 32 octets en base64', () => {
    expect(parseTotpKey(KEY.toString('base64'))?.equals(KEY)).toBe(true)
    expect(parseTotpKey(` ${KEY.toString('base64')}\n`)?.equals(KEY)).toBe(true)
  })

  it('rend null pour une clé absente, vide ou de mauvaise taille', () => {
    expect(parseTotpKey(undefined)).toBeNull()
    expect(parseTotpKey('')).toBeNull()
    expect(parseTotpKey(randomBytes(16).toString('base64'))).toBeNull()
    expect(parseTotpKey(randomBytes(33).toString('base64'))).toBeNull()
  })

  it('refuse un base64 permissif : caractère invalide, sans remplissage, base64url, espace intérieur', () => {
    const valid = KEY.toString('base64')

    expect(parseTotpKey(valid)).not.toBeNull()
    expect(parseTotpKey(`${valid.slice(0, 10)}!${valid.slice(11)}`)).toBeNull()
    expect(parseTotpKey(`${valid.slice(0, 10)} ${valid.slice(11)}`)).toBeNull()
    expect(parseTotpKey(valid.slice(0, -1))).toBeNull()
    expect(parseTotpKey(`${valid}=`)).toBeNull()
    // Clé fixe dont le base64 contient `+` et `/` (0xfb 0xfb 0xfb = « +/v7 ») : sa forme base64url est refusée.
    const withSigns = Buffer.alloc(32, 0xfb).toString('base64')
    expect(parseTotpKey(withSigns)).not.toBeNull()
    expect(parseTotpKey(withSigns.replace(/\+/g, '-').replace(/\//g, '_'))).toBeNull()
    // Une clé valide suivie de déchets : Buffer.from l'aurait lue, la regex non.
    expect(parseTotpKey(`${valid}!!!!`)).toBeNull()
  })

  it('refuse en production la clé publique de démonstration, l’accepte ailleurs', () => {
    expect(DEV_TOTP_ENCRYPTION_KEY).toMatch(/^[A-Za-z0-9+/]{43}=$/)
    expect(parseTotpKey(DEV_TOTP_ENCRYPTION_KEY, 'production')).toBeNull()
    expect(parseTotpKey(` ${DEV_TOTP_ENCRYPTION_KEY}\n`, 'production')).toBeNull()

    for (const nodeEnv of ['development', 'test', undefined]) {
      expect(parseTotpKey(DEV_TOTP_ENCRYPTION_KEY, nodeEnv)?.length).toBe(32)
    }
    // Une autre clé reste acceptée en production.
    expect(parseTotpKey(KEY.toString('base64'), 'production')?.equals(KEY)).toBe(true)
  })

  it('lit NODE_ENV par défaut', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(parseTotpKey(DEV_TOTP_ENCRYPTION_KEY)).toBeNull()
    vi.unstubAllEnvs()
    expect(parseTotpKey(DEV_TOTP_ENCRYPTION_KEY)).not.toBeNull()
  })
})
