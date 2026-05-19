import { ADMIN_STATUS_ACTIVE } from '@quizzup/shared'

import type { Account, AccountFieldErrors, AccountFormValues, CreateAccountPayload, UpdateAccountPayload } from '@/types/account'
import type { TranslateFn } from '@/types/company'

export function createAccountFieldErrors(): AccountFieldErrors {
  return {}
}

export function createDefaultAccountFormValues(): AccountFormValues {
  return {
    role: 'client',
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
    role: account.role,
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
): AccountFieldErrors {
  const errors = createAccountFieldErrors()

  if (form.role.trim().length < 2) {
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

function normalizeNullableText(value: string): string | null {
  const normalized = value.trim()

  return normalized ? normalized : null
}

export function buildCreateAccountPayload(form: AccountFormValues): CreateAccountPayload {
  return {
    role: form.role.trim(),
    firstname: normalizeNullableText(form.firstname),
    lastname: normalizeNullableText(form.lastname),
    username: form.username.trim(),
    email: form.email.trim().toLowerCase(),
    password: form.password,
  }
}

export function buildUpdateAccountPayload(form: AccountFormValues): UpdateAccountPayload {
  const payload: UpdateAccountPayload = {
    role: form.role.trim(),
    firstname: normalizeNullableText(form.firstname),
    lastname: normalizeNullableText(form.lastname),
    username: form.username.trim(),
    email: form.email.trim().toLowerCase(),
    status: form.status,
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
