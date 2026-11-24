import {
  VOUCHER_LABEL_MAX_LENGTH,
  VOUCHER_VALIDITY_DEFAULT_DAYS,
  VOUCHER_VALIDITY_MAX_DAYS,
  VOUCHER_VALIDITY_MIN_DAYS,
} from '@quizzup/shared'
import type { ComposerTranslation } from 'vue-i18n'

import type { Company, EditCompanyFieldErrors, UpdateCompanyPayload } from '@/types/company'

/** Réglages des bons d'un centre tels que saisis dans le formulaire de la compagnie. */
type VoucherSettingsValues = {
  voucherLabel: string
  voucherValidityDays: string
}

export function getVoucherSettingsValues(
  company: Pick<Company, 'voucherLabel' | 'voucherValidityDays'>
): VoucherSettingsValues {
  return {
    voucherLabel: company.voucherLabel ?? '',
    voucherValidityDays: String(company.voucherValidityDays ?? VOUCHER_VALIDITY_DEFAULT_DAYS),
  }
}

function parseValidityDays(input: string): number | null {
  const days = Number(input.trim())

  return input.trim() !== '' &&
    Number.isInteger(days) &&
    days >= VOUCHER_VALIDITY_MIN_DAYS &&
    days <= VOUCHER_VALIDITY_MAX_DAYS
    ? days
    : null
}

export function validateVoucherSettings(
  values: VoucherSettingsValues,
  t: ComposerTranslation
): Pick<EditCompanyFieldErrors, 'voucherLabel' | 'voucherValidityDays'> {
  return {
    voucherLabel:
      values.voucherLabel.trim().length > VOUCHER_LABEL_MAX_LENGTH
        ? t('vouchers.settings.labelTooLong', { max: VOUCHER_LABEL_MAX_LENGTH })
        : undefined,
    voucherValidityDays:
      parseValidityDays(values.voucherValidityDays) === null
        ? t('vouchers.settings.invalidValidity', {
            min: VOUCHER_VALIDITY_MIN_DAYS,
            max: VOUCHER_VALIDITY_MAX_DAYS,
          })
        : undefined,
  }
}

/** Libellé vide = `null` : c'est ainsi que l'API désactive les bons. */
export function buildVoucherSettingsPayload(
  values: VoucherSettingsValues
): Pick<UpdateCompanyPayload, 'voucherLabel' | 'voucherValidityDays'> {
  return {
    voucherLabel: values.voucherLabel.trim() || null,
    voucherValidityDays: parseValidityDays(values.voucherValidityDays) ?? undefined,
  }
}

export function hasVoucherSettingsChanges(
  values: VoucherSettingsValues,
  company: Pick<Company, 'voucherLabel' | 'voucherValidityDays'>
): boolean {
  const saved = getVoucherSettingsValues(company)

  return (
    values.voucherLabel.trim() !== saved.voucherLabel ||
    values.voucherValidityDays.trim() !== saved.voucherValidityDays
  )
}
