import {
  ADMIN_ROLE_ADMIN,
  ADMIN_ROLE_SUPERADMIN,
  VOUCHER_STATE_CANCELLED,
  VOUCHER_STATE_EXPIRED,
  VOUCHER_STATE_REDEEMED,
  VOUCHER_STATE_VALID,
  VOUCHER_STATES,
  type VoucherState,
} from '@quizzup/shared'

type VoucherStateTone = 'ok' | 'warn' | 'danger' | 'muted'

export function isVoucherState(value: unknown): value is VoucherState {
  return VOUCHER_STATES.includes(value as VoucherState)
}

export function getVoucherStateLabelKey(state: VoucherState): string {
  return `vouchers.state.${state}`
}

/** Seul un bon valable est « vivant » ; l'annulation est la seule anomalie (couleur de danger). */
export function getVoucherStateTone(state: VoucherState): VoucherStateTone {
  if (state === VOUCHER_STATE_VALID) {
    return 'ok'
  }

  if (state === VOUCHER_STATE_EXPIRED) {
    return 'warn'
  }

  if (state === VOUCHER_STATE_CANCELLED) {
    return 'danger'
  }

  return 'muted'
}

/** Un bon annulé ou déjà utilisé ne peut plus être annulé (matrice : `voucher:updateStatus`). */
export function canCancelVoucher(role: string | null | undefined, state: VoucherState): boolean {
  return (
    (role === ADMIN_ROLE_SUPERADMIN || role === ADMIN_ROLE_ADMIN) &&
    state !== VOUCHER_STATE_CANCELLED &&
    state !== VOUCHER_STATE_REDEEMED
  )
}

/** Noms du pupitre : joueur, puis son second joueur éventuel. */
export function getVoucherHolderNames(voucher: {
  displayName: string
  secondDisplayName: string | null
}): string {
  return [voucher.displayName, voucher.secondDisplayName].filter(Boolean).join(' · ')
}
