import { describe, expect, it } from 'vitest'

import { TOTP_CODE_LENGTH, TOTP_RECOVERY_CODES_COUNT } from '@quizzup/shared'

import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  generateSecret,
  hashRecoveryCode,
  isTotpFormat,
  otpauthUrl,
  stepAt,
  totpCode,
  verifyTotp,
} from '../../../../backend/src/security/totp'

// Annexe B de la RFC 6238 (SHA-1) : le secret est la chaîne ASCII « 12345678901234567890 », les codes
// ont 8 chiffres ; sur 6 chiffres on garde les 6 derniers.
const RFC_KEY = Buffer.from('12345678901234567890')
const RFC_SECRET = base32Encode(RFC_KEY)
const RFC_VECTORS: Array<[time: number, code8: string]> = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
]

describe('security/totp.ts — calcul du code', () => {
  it.each(RFC_VECTORS)('T = %i donne le code RFC %s (8 chiffres)', (time, code8) => {
    expect(totpCode(RFC_KEY, stepAt(time * 1000), 8)).toBe(code8)
  })

  it.each(RFC_VECTORS)('T = %i donne les 6 derniers chiffres sur 6 chiffres', (time, code8) => {
    expect(totpCode(RFC_KEY, stepAt(time * 1000))).toBe(code8.slice(-TOTP_CODE_LENGTH))
  })

  it('numérote les pas de 30 secondes', () => {
    expect(stepAt(0)).toBe(0)
    expect(stepAt(29_999)).toBe(0)
    expect(stepAt(30_000)).toBe(1)
    expect(stepAt(59_000)).toBe(1)
  })
})

describe('security/totp.ts — base32', () => {
  it('suit les vecteurs de la RFC 4648 (sans remplissage)', () => {
    const vectors: Array<[string, string]> = [
      ['', ''],
      ['f', 'MY'],
      ['fo', 'MZXQ'],
      ['foo', 'MZXW6'],
      ['foob', 'MZXW6YQ'],
      ['fooba', 'MZXW6YTB'],
      ['foobar', 'MZXW6YTBOI'],
    ]

    for (const [text, encoded] of vectors) {
      expect(base32Encode(Buffer.from(text))).toBe(encoded)
      expect(base32Decode(encoded).toString()).toBe(text)
    }
  })

  it('décode sans tenir compte de la casse, des espaces et du remplissage', () => {
    expect(base32Decode('mzxw 6ytb oi======').toString()).toBe('foobar')
  })

  it('refuse un caractère hors alphabet', () => {
    expect(() => base32Decode('MZXW1')).toThrow()
  })

  it('génère des secrets de 160 bits, tous différents', () => {
    const a = generateSecret()
    const b = generateSecret()

    expect(a).toMatch(/^[A-Z2-7]{32}$/)
    expect(base32Decode(a)).toHaveLength(20)
    expect(a).not.toBe(b)
  })
})

describe('security/totp.ts — vérification', () => {
  // 1234567890 s : code RFC « 89005924 », donc « 005924 » sur 6 chiffres.
  const NOW_MS = 1234567890 * 1000
  const STEP = stepAt(NOW_MS)
  const codeAt = (step: number) => totpCode(RFC_KEY, step)

  it('accepte le code du pas courant et rend son numéro de pas', () => {
    expect(verifyTotp(RFC_SECRET, '005924', NOW_MS)).toBe(STEP)
  })

  it('accepte un pas avant et un pas après (écart d’horloge), pas deux', () => {
    expect(verifyTotp(RFC_SECRET, codeAt(STEP - 1), NOW_MS)).toBe(STEP - 1)
    expect(verifyTotp(RFC_SECRET, codeAt(STEP + 1), NOW_MS)).toBe(STEP + 1)
    expect(verifyTotp(RFC_SECRET, codeAt(STEP - 2), NOW_MS)).toBeNull()
    expect(verifyTotp(RFC_SECRET, codeAt(STEP + 2), NOW_MS)).toBeNull()
  })

  it('refuse un code faux, vide ou de mauvaise longueur', () => {
    expect(verifyTotp(RFC_SECRET, '000000', NOW_MS)).toBeNull()
    expect(verifyTotp(RFC_SECRET, '', NOW_MS)).toBeNull()
    expect(verifyTotp(RFC_SECRET, '5924', NOW_MS)).toBeNull()
    expect(verifyTotp(RFC_SECRET, '0059240', NOW_MS)).toBeNull()
  })

  it('refuse le code d’un autre secret', () => {
    expect(verifyTotp(generateSecret(), '005924', NOW_MS)).toBeNull()
  })

  it('reconnaît le format d’un code TOTP', () => {
    expect(isTotpFormat('005924')).toBe(true)
    expect(isTotpFormat('12345')).toBe(false)
    expect(isTotpFormat('1234567')).toBe(false)
    expect(isTotpFormat('abcde-fghij')).toBe(false)
  })
})

describe('security/totp.ts — adresse otpauth', () => {
  it('porte le secret, l’émetteur et les paramètres, avec l’émetteur encodé', () => {
    const url = new URL(otpauthUrl('JBSWY3DPEHPK3PXP', 'root@quizzup.test', 'Quizz Up'))

    expect(url.protocol).toBe('otpauth:')
    expect(url.hostname).toBe('totp')
    expect(decodeURIComponent(url.pathname)).toBe('/Quizz Up:root@quizzup.test')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      secret: 'JBSWY3DPEHPK3PXP',
      issuer: 'Quizz Up',
      algorithm: 'SHA1',
      digits: '6',
      period: '30',
    })
  })
})

describe('security/totp.ts — codes de secours', () => {
  it('en génère dix au format xxxxx-xxxxx, tous différents', () => {
    const codes = generateRecoveryCodes()

    expect(codes).toHaveLength(TOTP_RECOVERY_CODES_COUNT)
    expect(new Set(codes).size).toBe(codes.length)
    for (const code of codes) expect(code).toMatch(/^[a-z2-7]{5}-[a-z2-7]{5}$/)
  })

  it('ne confond jamais un code de secours avec un code TOTP', () => {
    for (const code of generateRecoveryCodes()) expect(isTotpFormat(code)).toBe(false)
  })

  it('hache la saisie normalisée : casse, tiret et espaces sans effet', () => {
    const hash = hashRecoveryCode('abcde-fghij')

    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hashRecoveryCode('ABCDE-FGHIJ')).toBe(hash)
    expect(hashRecoveryCode('abcdefghij')).toBe(hash)
    expect(hashRecoveryCode(' abcde fghij ')).toBe(hash)
    expect(hashRecoveryCode('abcde-fghik')).not.toBe(hash)
  })
})
