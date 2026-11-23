import db from '../db'
import { openSecret } from './secretBox'
import { hashRecoveryCode, isTotpFormat, verifyTotp } from './totp'

/** Échecs de suite qui verrouillent le deuxième facteur, et durée du verrou. */
export const TOTP_MAX_FAILED_ATTEMPTS = 5
export const TOTP_LOCK_MINUTES = 15

export type AdminTotpRecord = {
  secretEnc: string
  confirmedAt: Date | null
  lastUsedStep: number | null
  failedAttempts: number
  lockedUntil: Date | null
}

type AdminTotpRow = {
  secret_enc: string
  confirmed_at: Date | null
  last_used_step: number | null
  failed_attempts: number
  locked_until: Date | null
}

export async function getAdminTotp(adminId: number): Promise<AdminTotpRecord | undefined> {
  const row = await db<AdminTotpRow>('admin_totp').where({ admin_id: adminId }).first()

  if (!row) return undefined

  return {
    secretEnc: row.secret_enc,
    confirmedAt: row.confirmed_at,
    lastUsedStep: row.last_used_step,
    failedAttempts: row.failed_attempts,
    lockedUntil: row.locked_until,
  }
}

/**
 * Crée ou remplace le secret d'un enrôlement en cours. Faux si le deuxième facteur est déjà
 * confirmé : un secret confirmé ne se remplace jamais par cette voie.
 */
export async function startEnrollment(adminId: number, secretEnc: string): Promise<boolean> {
  const result = await db.raw(
    `INSERT INTO admin_totp (admin_id, secret_enc) VALUES (?, ?)
     ON CONFLICT (admin_id) DO UPDATE
       SET secret_enc = EXCLUDED.secret_enc, updated_at = now()
       WHERE admin_totp.confirmed_at IS NULL`,
    [adminId, secretEnc]
  )

  return result.rowCount === 1
}

/**
 * Confirme l'enrôlement et enregistre les codes de secours, en une transaction. Le pas du code de
 * confirmation devient le dernier pas utilisé : il ne sert pas une seconde fois. Faux si
 * l'enrôlement est déjà confirmé (ou absent) : l'UPDATE conditionnel départage deux requêtes
 * simultanées.
 */
export async function confirmEnrollment(
  adminId: number,
  step: number,
  recoveryCodes: string[],
  now: Date
): Promise<boolean> {
  return db.transaction(async (trx) => {
    const confirmed = await trx('admin_totp')
      .where({ admin_id: adminId })
      .whereNull('confirmed_at')
      .update({
        confirmed_at: now,
        last_used_step: step,
        failed_attempts: 0,
        locked_until: null,
        updated_at: now,
      })

    if (confirmed !== 1) return false

    await trx('admin_totp_recovery_codes').where({ admin_id: adminId }).delete()
    await trx('admin_totp_recovery_codes').insert(
      recoveryCodes.map((code) => ({ admin_id: adminId, code_hash: hashRecoveryCode(code) }))
    )

    return true
  })
}

/**
 * Anti-rejeu : un pas n'est accepté que s'il dépasse le dernier pas utilisé, par un seul UPDATE
 * conditionnel (deux requêtes simultanées avec le même code : une seule réussit). Réussir remet les
 * échecs à zéro. Un compte verrouillé n'accepte rien, même avec le bon code.
 */
export async function acceptStep(adminId: number, step: number, now: Date): Promise<boolean> {
  const updated = await db('admin_totp')
    .where({ admin_id: adminId })
    .whereNotNull('confirmed_at')
    .andWhere((q) => q.whereNull('last_used_step').orWhere('last_used_step', '<', step))
    .andWhere((q) => q.whereNull('locked_until').orWhere('locked_until', '<=', now))
    .update({ last_used_step: step, failed_attempts: 0, locked_until: null, updated_at: now })

  return updated === 1
}

/**
 * Consomme un code de secours : un seul UPDATE conditionnel sur `used_at IS NULL`, donc usage unique
 * même en parallèle. Refusé si le compte est verrouillé. Réussir remet les échecs à zéro.
 */
export async function consumeRecoveryCode(
  adminId: number,
  codeHash: string,
  now: Date
): Promise<boolean> {
  return db.transaction(async (trx) => {
    const result = await trx.raw(
      `UPDATE admin_totp_recovery_codes AS c SET used_at = ?
       WHERE c.admin_id = ? AND c.code_hash = ? AND c.used_at IS NULL
         AND EXISTS (
           SELECT 1 FROM admin_totp t
           WHERE t.admin_id = c.admin_id AND (t.locked_until IS NULL OR t.locked_until <= ?)
         )`,
      [now, adminId, codeHash, now]
    )

    if (result.rowCount !== 1) return false

    await trx('admin_totp')
      .where({ admin_id: adminId })
      .update({ failed_attempts: 0, locked_until: null, updated_at: now })

    return true
  })
}

export async function countUnusedRecoveryCodes(adminId: number): Promise<number> {
  const row = await db('admin_totp_recovery_codes')
    .where({ admin_id: adminId })
    .whereNull('used_at')
    .count({ n: '*' })
    .first()

  return Number(row?.n ?? 0)
}

/**
 * Compte un échec en un seul UPDATE ; au 5e échec de suite, verrouille pour 15 minutes. Le compteur
 * reste à 5 tant qu'un succès ne le remet pas à zéro : un échec juste après la fin du verrou
 * reverrouille aussitôt.
 */
export async function recordFailure(adminId: number, now: Date): Promise<void> {
  const lockedUntil = new Date(now.getTime() + TOTP_LOCK_MINUTES * 60_000)

  await db.raw(
    `UPDATE admin_totp SET
       failed_attempts = LEAST(failed_attempts + 1, ?),
       locked_until = CASE WHEN failed_attempts + 1 >= ? THEN ?::timestamptz ELSE locked_until END,
       updated_at = ?
     WHERE admin_id = ?`,
    [TOTP_MAX_FAILED_ATTEMPTS, TOTP_MAX_FAILED_ATTEMPTS, lockedUntil, now, adminId]
  )
}

/**
 * Efface le deuxième facteur d'un admin (secret et codes de secours) et révoque toutes ses sessions :
 * son prochain login repasse par l'enrôlement. Sert à `DELETE /me/totp` et à la commande `totp:reset`.
 */
export async function resetAdminTotp(adminId: number): Promise<void> {
  await db.transaction(async (trx) => {
    await trx('admin_totp_recovery_codes').where({ admin_id: adminId }).delete()
    await trx('admin_totp').where({ admin_id: adminId }).delete()
    await trx('admin_sessions')
      .where({ admin_id: adminId })
      .whereNull('revoked_at')
      .update({ revoked_at: trx.fn.now() })
  })
}

export type SecondFactorResult =
  | { ok: true; recoveryCode: boolean }
  | { ok: false; reason: 'not_enrolled' }
  | { ok: false; reason: 'locked'; retryAfterSeconds: number }
  | { ok: false; reason: 'invalid' }

/**
 * Vérifie le deuxième facteur d'un admin : code TOTP (6 chiffres) ou code de secours. Un code faux
 * et un code rejoué ont le même résultat `invalid`, et comptent tous deux comme un échec. Lève si le
 * secret stocké ne se déchiffre pas (clé changée, ligne altérée) : c'est une erreur serveur.
 */
export async function verifySecondFactor(
  adminId: number,
  code: string,
  key: Buffer,
  now: Date
): Promise<SecondFactorResult> {
  const record = await getAdminTotp(adminId)

  if (!record?.confirmedAt) return { ok: false, reason: 'not_enrolled' }

  if (record.lockedUntil && record.lockedUntil.getTime() > now.getTime()) {
    const seconds = Math.ceil((record.lockedUntil.getTime() - now.getTime()) / 1000)

    return { ok: false, reason: 'locked', retryAfterSeconds: Math.max(1, seconds) }
  }

  const isCode = isTotpFormat(code)
  let accepted: boolean

  if (isCode) {
    const step = verifyTotp(openSecret(key, adminId, record.secretEnc), code, now.getTime())
    accepted = step !== null && (await acceptStep(adminId, step, now))
  } else {
    accepted = await consumeRecoveryCode(adminId, hashRecoveryCode(code), now)
  }

  if (!accepted) {
    await recordFailure(adminId, now)

    return { ok: false, reason: 'invalid' }
  }

  return { ok: true, recoveryCode: !isCode }
}
