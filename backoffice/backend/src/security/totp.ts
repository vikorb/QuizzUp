import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { TOTP_CODE_LENGTH, TOTP_RECOVERY_CODES_COUNT } from '@quizzup/shared'

/**
 * TOTP (RFC 6238) écrit avec `node:crypto` : HMAC-SHA1, pas de 30 s, tolérance d'un pas de chaque côté
 * pour l'écart d'horloge du téléphone. Aucune dépendance : les vecteurs de l'annexe B de la RFC
 * valident le calcul (tests/backend/src/security/totp.test.ts).
 */

export const TOTP_PERIOD_SECONDS = 30
/** Pas acceptés de part et d'autre du pas courant. */
export const TOTP_WINDOW = 1
/** Octets du secret : 160 bits, la taille d'une sortie SHA-1 (RFC 4226 §4). */
const SECRET_BYTES = 20

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Encodage base32 RFC 4648, sans remplissage. */
export function base32Encode(bytes: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''

  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8

    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }

  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31]

  return out
}

/** Décodage base32, insensible à la casse, aux espaces et au remplissage. Lève sur un autre caractère. */
export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=]/g, '').toUpperCase()
  const bytes: number[] = []
  let bits = 0
  let value = 0

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) throw new Error('base32 invalide')

    value = (value << 5) | index
    bits += 5

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }

  return Buffer.from(bytes)
}

/** Nouveau secret, en base32 (ce que l'utilisateur saisit dans son application). */
export function generateSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES))
}

/** Numéro du pas de 30 s qui contient cet instant (millisecondes depuis l'époque). */
export function stepAt(timeMs: number): number {
  return Math.floor(timeMs / 1000 / TOTP_PERIOD_SECONDS)
}

/** Code du pas donné (HOTP, RFC 4226 : troncature dynamique). `digits` ne varie que pour les vecteurs de la RFC. */
export function totpCode(key: Buffer, step: number, digits = TOTP_CODE_LENGTH): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))

  const hmac = createHmac('sha1', key).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3]

  return String(binary % 10 ** digits).padStart(digits, '0')
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)

  return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * Pas dont le code correspond à la saisie, ou null. Les trois pas de la fenêtre sont toujours tous
 * comparés (en temps constant) : le temps de réponse ne dit pas quel pas a réussi. Le pas rendu sert
 * à l'anti-rejeu : l'appelant ne l'accepte que s'il dépasse le dernier pas utilisé.
 */
export function verifyTotp(secretBase32: string, code: string, nowMs: number): number | null {
  const key = base32Decode(secretBase32)
  const current = stepAt(nowMs)
  let matched: number | null = null

  for (let step = current - TOTP_WINDOW; step <= current + TOTP_WINDOW; step += 1) {
    if (sameText(totpCode(key, step), code)) matched = step
  }

  return matched
}

/** Adresse `otpauth://` d'un secret, ce que lit une application d'authentification. */
export function otpauthUrl(secretBase32: string, account: string, issuer: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`
  const query = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_CODE_LENGTH),
    period: String(TOTP_PERIOD_SECONDS),
  })

  return `otpauth://totp/${label}?${query.toString()}`
}

/** Vrai pour un code TOTP (chiffres seulement) ; tout le reste est tenté comme code de secours. */
export function isTotpFormat(code: string): boolean {
  return code.length === TOTP_CODE_LENGTH && /^[0-9]+$/.test(code)
}

/** Dix codes `xxxxx-xxxxx` en base32 minuscule : 50 bits chacun. */
export function generateRecoveryCodes(): string[] {
  return Array.from({ length: TOTP_RECOVERY_CODES_COUNT }, () => {
    const text = base32Encode(randomBytes(7)).slice(0, 10).toLowerCase()

    return `${text.slice(0, 5)}-${text.slice(5)}`
  })
}

/**
 * Empreinte stockée d'un code de secours : SHA-256 de la saisie normalisée (minuscules, sans tiret
 * ni espace). bcrypt n'apporterait rien avec 50 bits aléatoires.
 */
export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code.toLowerCase().replace(/[\s-]/g, '')).digest('hex')
}
