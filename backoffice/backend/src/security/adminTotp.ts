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
 * confirmation devient le dernier pas utilisé : il ne sert pas une seconde fois. `secretEnc` est le
 * secret contre lequel le code a été vérifié : faux si l'enrôlement est déjà confirmé, absent ou si
 * son secret a été régénéré entre-temps. L'UPDATE conditionnel départage les requêtes simultanées.
 */
export async function confirmEnrollment(
  adminId: number,
  secretEnc: string,
  step: number,
  recoveryCodes: string[],
  now: Date
): Promise<boolean> {
  return db.transaction(async (trx) => {
    const confirmed = await trx('admin_totp')
      .where({ admin_id: adminId, secret_enc: secretEnc })
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
 * échecs à zéro. Le verrou n'est pas relu ici : `reserveAttempt` l'a déjà contrôlé, atomiquement,
 * pour cet essai.
 */
export async function acceptStep(adminId: number, step: number, now: Date): Promise<boolean> {
  const updated = await db('admin_totp')
    .where({ admin_id: adminId })
    .whereNotNull('confirmed_at')
    .andWhere((q) => q.whereNull('last_used_step').orWhere('last_used_step', '<', step))
    .update({ last_used_step: step, failed_attempts: 0, locked_until: null, updated_at: now })

  return updated === 1
}

/**
 * Consomme un code de secours : un seul UPDATE conditionnel sur `used_at IS NULL`, donc usage unique
 * même en parallèle. Réussir remet les échecs à zéro. Comme `acceptStep`, ne relit pas le verrou.
 */
export async function consumeRecoveryCode(
  adminId: number,
  codeHash: string,
  now: Date
): Promise<boolean> {
  return db.transaction(async (trx) => {
    const used = await trx('admin_totp_recovery_codes')
      .where({ admin_id: adminId, code_hash: codeHash })
      .whereNull('used_at')
      .update({ used_at: now })

    if (used !== 1) return false

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
 * Réserve un essai avant de comparer le code, en un seul UPDATE : il compte l'essai comme un échec
 * et, au 5e de suite, pose le verrou de 15 minutes ; il ne touche rien si le compte est verrouillé
 * (ou non enrôlé) et rend alors faux. Des requêtes parallèles ne peuvent donc pas tester plus de
 * 5 codes avant le verrou. Un succès (`acceptStep`, `consumeRecoveryCode`) remet le compteur à zéro.
 * Le compteur reste à 5 tant qu'un succès ne le remet pas à zéro : un essai juste après la fin du
 * verrou reverrouille aussitôt.
 */
export async function reserveAttempt(adminId: number, now: Date): Promise<boolean> {
  const lockedUntil = new Date(now.getTime() + TOTP_LOCK_MINUTES * 60_000)

  const result = await db.raw(
    `UPDATE admin_totp SET
       failed_attempts = LEAST(failed_attempts + 1, ?),
       locked_until = CASE WHEN failed_attempts + 1 >= ? THEN ?::timestamptz ELSE locked_until END,
       updated_at = ?
     WHERE admin_id = ? AND confirmed_at IS NOT NULL
       AND (locked_until IS NULL OR locked_until <= ?)`,
    [TOTP_MAX_FAILED_ATTEMPTS, TOTP_MAX_FAILED_ATTEMPTS, lockedUntil, now, adminId, now]
  )

  return result.rowCount === 1
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

  // L'essai est compté et le verrou contrôlé avant toute comparaison : c'est ce qui borne les
  // requêtes parallèles. Refus = verrouillé (ou enrôlement effacé entre-temps).
  if (!(await reserveAttempt(adminId, now))) {
    const current = await getAdminTotp(adminId)
    if (!current?.confirmedAt) return { ok: false, reason: 'not_enrolled' }

    const seconds = current.lockedUntil
      ? Math.ceil((current.lockedUntil.getTime() - now.getTime()) / 1000)
      : 0

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

  if (!accepted) return { ok: false, reason: 'invalid' }

  return { ok: true, recoveryCode: !isCode }
}
