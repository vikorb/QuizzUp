import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Chiffrement au repos des secrets TOTP : AES-256-GCM, format `v1.<iv>.<tag>.<chiffré>` (base64).
 * Les données associées portent l'id de l'admin : un chiffré recopié sur la ligne d'un autre admin
 * ne se déchiffre pas. La clé (`TOTP_ENCRYPTION_KEY`) n'est jamais dans la base.
 */

const VERSION = 'v1'
const KEY_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16

/** Valeur publique de `TOTP_ENCRYPTION_KEY` (docker-compose de dev) : jamais en production. */
export const DEV_TOTP_ENCRYPTION_KEY = 'REVNTy1PTkxZLW5vdC1hLXNlY3JldC1rZXktMDAwMDA='

/** 32 octets en base64 strict : 43 caractères et un `=`. */
const KEY_BASE64 = /^[A-Za-z0-9+/]{43}=$/

/**
 * Clé lue depuis `TOTP_ENCRYPTION_KEY` (32 octets en base64), ou null si absente, mal formée ou, en
 * production, égale à la valeur publique de développement.
 */
export function parseTotpKey(
  raw: string | undefined,
  nodeEnv = process.env.NODE_ENV
): Buffer | null {
  const trimmed = raw?.trim()

  if (!trimmed || !KEY_BASE64.test(trimmed)) return null
  if (nodeEnv === 'production' && trimmed === DEV_TOTP_ENCRYPTION_KEY) return null

  const key = Buffer.from(trimmed, 'base64')

  return key.length === KEY_BYTES ? key : null
}

function aad(adminId: number): Buffer {
  return Buffer.from(`admin:${adminId}`)
}

export function sealSecret(key: Buffer, adminId: number, plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(aad(adminId))
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])

  const tag = cipher.getAuthTag()

  return [VERSION, iv, tag, encrypted]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64')))
    .join('.')
}

/** Déchiffre ; lève si le format, la clé, l'admin ou le contenu ne correspondent pas. */
export function openSecret(key: Buffer, adminId: number, sealed: string): string {
  const [version, iv, tag, encrypted, ...rest] = sealed.split('.')
  if (version !== VERSION || !iv || !tag || !encrypted || rest.length > 0) {
    throw new Error('secret chiffré illisible')
  }

  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'), {
    authTagLength: TAG_BYTES,
  })
  decipher.setAAD(aad(adminId))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}
