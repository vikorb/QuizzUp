import type { TranslateFn } from '@/types'
import type {
  CreateRoomAccountPayload,
  RoomAccountFieldErrors,
  RoomAccountFormValues,
} from '@/types/room'

/** Alignés sur `createRoomAccountSchema` côté backend (US-ROOM-02). */
export const ROOM_ACCOUNT_USERNAME_MIN_LENGTH = 3
export const ROOM_ACCOUNT_USERNAME_MAX_LENGTH = 255
export const ROOM_ACCOUNT_USERNAME_PATTERN = /^[\w.-]+$/
export const ROOM_ACCOUNT_PASSWORD_MIN_LENGTH = 8
export const ROOM_ACCOUNT_PASSWORD_MAX_LENGTH = 100

export function createRoomAccountFieldErrors(): RoomAccountFieldErrors {
  return {}
}

export function createDefaultRoomAccountFormValues(): RoomAccountFormValues {
  return {
    username: '',
    password: '',
    passwordConfirm: '',
  }
}

export function hasRoomAccountFormErrors(errors: RoomAccountFieldErrors): boolean {
  return Object.values(errors).some(Boolean)
}

function validateUsername(username: string, t: TranslateFn): string | undefined {
  if (username.length === 0) {
    return t('rooms.account.validation.usernameRequired')
  }

  if (username.length < ROOM_ACCOUNT_USERNAME_MIN_LENGTH) {
    return t('rooms.account.validation.usernameTooShort')
  }

  if (username.length > ROOM_ACCOUNT_USERNAME_MAX_LENGTH) {
    return t('rooms.account.validation.usernameTooLong')
  }

  if (!ROOM_ACCOUNT_USERNAME_PATTERN.test(username)) {
    return t('rooms.account.validation.usernameInvalid')
  }

  return undefined
}

function validatePassword(password: string, t: TranslateFn): string | undefined {
  if (password.length === 0) {
    return t('rooms.account.validation.passwordRequired')
  }

  if (password.length < ROOM_ACCOUNT_PASSWORD_MIN_LENGTH) {
    return t('rooms.account.validation.passwordTooShort')
  }

  if (password.length > ROOM_ACCOUNT_PASSWORD_MAX_LENGTH) {
    return t('rooms.account.validation.passwordTooLong')
  }

  return undefined
}

export function validateRoomAccountForm(
  form: RoomAccountFormValues,
  t: TranslateFn
): RoomAccountFieldErrors {
  const errors = createRoomAccountFieldErrors()

  errors.username = validateUsername(form.username.trim(), t)
  errors.password = validatePassword(form.password, t)

  // La confirmation n'existe que côté front : l'API ne reçoit qu'un mot de passe.
  if (form.passwordConfirm.length === 0) {
    errors.passwordConfirm = t('rooms.account.validation.passwordConfirmRequired')
  } else if (form.passwordConfirm !== form.password) {
    errors.passwordConfirm = t('rooms.account.validation.passwordMismatch')
  }

  return errors
}

export function buildCreateRoomAccountPayload(
  form: RoomAccountFormValues
): CreateRoomAccountPayload {
  return {
    username: form.username.trim(),
    password: form.password,
  }
}

export function getRoomAccountApiFieldError(
  errorCode: string,
  t: TranslateFn
): { field: keyof RoomAccountFieldErrors; message: string } | null {
  if (errorCode === 'username_already_exists') {
    return {
      field: 'username',
      message: t('rooms.account.errors.username_already_exists'),
    }
  }

  return null
}

export function getRoomAccountApiFormError(errorCode: string, t: TranslateFn): string {
  const key = `rooms.account.errors.${errorCode}`
  const translated = t(key)

  return translated === key ? t('rooms.account.errors.default') : translated
}

/** Date de création lisible (jour seulement), ou la valeur brute si elle est invalide. */
export function formatRoomAccountDate(value: string, locale: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleDateString(locale)
}
