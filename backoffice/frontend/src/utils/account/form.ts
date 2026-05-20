import {
  ADMIN_ROLE_ADMIN,
  ADMIN_ROLE_SUPERADMIN,
  ADMIN_ROLE_USER,
  ADMIN_STATUS_ACTIVE,
  type AdminRole,
} from '@quizzup/shared'

import type {
  Account,
  AccountFieldErrors,
  AccountFormValues,
  CreateAccountPayload,
  UpdateAccountPayload,
} from '@/types/account'
import type { TranslateFn } from '@/types/company'

const ADMIN_ROLE_VALUES: AdminRole[] = [
  ADMIN_ROLE_SUPERADMIN,
  ADMIN_ROLE_ADMIN,
  ADMIN_ROLE_USER,
]

export function createAccountFieldErrors(): AccountFieldErrors {
  return {}
}

export function createDefaultAccountFormValues(): AccountFormValues {
  return {
    role: ADMIN_ROLE_USER,
    firstname: '',
    lastname: '',
    username: '',
    email: '',
    password: '',
    status: ADMIN_STATUS_ACTIVE,
  }
}

export function getAccountFormValues(account: Account): AccountFormValues {
  return {
    role: isAdminRole(account.role) ? account.role : ADMIN_ROLE_USER,
    firstname: account.firstname ?? '',
    lastname: account.lastname ?? '',
    username: account.username,
    email: account.email,
    password: '',
    status: account.status,
  }
}

export function hasAccountFormErrors(errors: AccountFieldErrors): boolean {
  return Object.values(errors).some(Boolean)
}

export function validateAccountForm(
  form: AccountFormValues,
  t: TranslateFn,
  mode: 'create' | 'edit',
  canManageRole = true,
): AccountFieldErrors {
  const errors = createAccountFieldErrors()

  if (canManageRole && !isAdminRole(form.role)) {
    errors.role = t('accounts.form.validation.roleRequired')
  }

  if (form.username.trim().length < 3) {
    errors.username = t('accounts.form.validation.usernameRequired')
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = t('accounts.form.validation.emailInvalid')
  }

  if (mode === 'create' && form.password.length < 8) {
    errors.password = t('accounts.form.validation.passwordRequired')
  }

  if (mode === 'edit' && form.password.trim() !== '' && form.password.length < 8) {
    errors.password = t('accounts.form.validation.passwordMin')
  }

  return errors
}

function isAdminRole(value: string): value is AdminRole {
  return ADMIN_ROLE_VALUES.includes(value as AdminRole)
}

function normalizeNullableText(value: string): string | null {
  const normalized = value.trim()

  return normalized ? normalized : null
}

function getPayloadRole(form: AccountFormValues, canManageRole: boolean): AdminRole {
  if (!canManageRole) {
    return ADMIN_ROLE_USER
  }

  return isAdminRole(form.role) ? form.role : ADMIN_ROLE_USER
}

export function buildCreateAccountPayload(
  form: AccountFormValues,
  canManageRole = true,
): CreateAccountPayload {
  return {
    role: getPayloadRole(form, canManageRole),
    firstname: normalizeNullableText(form.firstname),
    lastname: normalizeNullableText(form.lastname),
    username: form.username.trim(),
    email: form.email.trim().toLowerCase(),
    password: form.password,
  }
}

export function buildUpdateAccountPayload(
  form: AccountFormValues,
  canManageRole = true,
): UpdateAccountPayload {
  const payload: UpdateAccountPayload = {
    firstname: normalizeNullableText(form.firstname),
    lastname: normalizeNullableText(form.lastname),
    username: form.username.trim(),
    email: form.email.trim().toLowerCase(),
    status: form.status,
  }

  if (canManageRole && isAdminRole(form.role)) {
    payload.role = form.role
  }

  if (form.password.trim() !== '') {
    payload.password = form.password
  }

  return payload
}

export function getAccountApiFieldError(
  errorCode: string,
  t: TranslateFn,
): { field: keyof AccountFieldErrors; message: string } | null {
  if (errorCode === 'email_already_exists') {
    return {
      field: 'email',
      message: t('accounts.form.errors.emailAlreadyExists'),
    }
  }

  if (errorCode === 'username_already_exists') {
    return {
      field: 'username',
      message: t('accounts.form.errors.usernameAlreadyExists'),
    }
  }

  return null
}

export function getAccountApiFormError(errorCode: string, t: TranslateFn): string {
  const key = `accounts.form.errors.${errorCode}`
  const translated = t(key)

  return translated === key ? t('accounts.form.errors.default') : translated
}
