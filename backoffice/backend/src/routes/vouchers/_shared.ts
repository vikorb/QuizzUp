import { randomBytes } from 'node:crypto'

import {
  formatVoucherCode,
  getVoucherState,
  VOUCHER_CODE_ALPHABET,
  VOUCHER_CODE_LENGTH,
  VOUCHER_STATUS_DELETED,
  type VoucherState,
} from '@quizzup/shared'
import db from '../../db'
import { qrSvg } from '../../utils/qrSvg'

/** Index unique partiel : un bon par pupitre et par partie (la collision de code est l'autre cas). */
export const VOUCHER_ISSUED_CONSTRAINT = 'vouchers_game_id_participant_id_active_unique'

/** Colonnes d'un bon avec le nom du pupitre (jamais l'e-mail : le bon n'en a pas besoin). */
export const voucherSelect = [
  'vouchers.id',
  'vouchers.game_id as gameId',
  'vouchers.participant_id as participantId',
  'game_participants.podium',
  'game_participants.display_name as displayName',
  'game_participants.second_display_name as secondDisplayName',
  'vouchers.code',
  'vouchers.label',
  'vouchers.status',
  'vouchers.expires_at as expiresAt',
  'vouchers.redeemed_at as redeemedAt',
  'vouchers.redeemed_by as redeemedBy',
  'vouchers.created_at as createdAt',
]

type VoucherDbRow = {
  id: number
  gameId: number
  participantId: number
  podium: number
  displayName: string
  secondDisplayName: string | null
  code: string
  label: string
  status: number
  expiresAt: Date
  redeemedAt: Date | null
  redeemedBy: number | null
  createdAt: Date
}

export type VoucherRow = Omit<VoucherDbRow, 'status'> & {
  state: VoucherState
  /** Lien lu par le QR de la feuille ; nul tant que `PUBLIC_APP_URL` n'est pas réglée. */
  url: string | null
}

/** Bons non supprimés avec leur pupitre ; l'appelant ajoute le filtre de compagnie. */
export function voucherQuery() {
  return db('vouchers')
    .join('game_participants', 'game_participants.id', 'vouchers.participant_id')
    .whereNot('vouchers.status', VOUCHER_STATUS_DELETED)
}

/**
 * Adresse de la page publique du bon : `PUBLIC_APP_URL/bon/#<code>`. Le code reste dans le
 * fragment, qui n'est jamais envoyé au serveur ni consigné dans ses journaux.
 */
export function voucherUrl(code: string): string | null {
  const base = process.env.PUBLIC_APP_URL?.trim().replace(/\/+$/, '')

  return base ? `${base}/bon/#${code}` : null
}

export function toVoucherRow(row: Record<string, unknown>, now: Date = new Date()): VoucherRow {
  const { status, ...voucher } = row as VoucherDbRow

  return {
    ...voucher,
    state: getVoucherState(
      { status, redeemedAt: voucher.redeemedAt, expiresAt: voucher.expiresAt },
      now
    ),
    url: voucherUrl(voucher.code),
  }
}

/**
 * Ajoute le QR code de la page du bon (`null` si `url` l'est). À part de `toVoucherRow` : un QR
 * coûte, et la liste de la compagnie (jusqu'à `VOUCHER_LIST_MAX_LIMIT` bons) n'en a pas besoin.
 */
export function withVoucherQr(voucher: VoucherRow): VoucherRow & { qrSvg: string | null } {
  return { ...voucher, qrSvg: voucher.url ? qrSvg(voucher.url) : null }
}

/**
 * Bon d'une compagnie à partir de ce que saisit le personnel. Un code mal formé, inconnu, supprimé
 * ou d'une autre compagnie ne se distinguent pas : `undefined`.
 */
export async function findVoucherByCode(
  companyId: number,
  input: string
): Promise<VoucherRow | undefined> {
  const code = formatVoucherCode(input)

  if (!code) {
    return undefined
  }

  const row = await voucherQuery()
    .where('vouchers.company_id', companyId)
    .where('vouchers.code', code)
    .first(voucherSelect)

  return row ? toVoucherRow(row) : undefined
}

export async function findVoucherById(
  companyId: number,
  voucherId: number
): Promise<VoucherRow | undefined> {
  const row = await voucherQuery()
    .where('vouchers.company_id', companyId)
    .where('vouchers.id', voucherId)
    .first(voucherSelect)

  return row ? toVoucherRow(row) : undefined
}

/** Code `XXXX-XXXX` tiré sur 40 bits par le générateur du système (5 bits par caractère). */
export function generateVoucherCode(): string {
  let value = randomBytes(5).readUIntBE(0, 5)
  let code = ''

  for (let index = 0; index < VOUCHER_CODE_LENGTH; index += 1) {
    code = VOUCHER_CODE_ALPHABET[value % 32] + code
    value = Math.floor(value / 32)
  }

  return `${code.slice(0, 4)}-${code.slice(4)}`
}
