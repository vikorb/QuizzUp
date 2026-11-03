import type { TranslateFn } from '@/types'
import type {
  CreateRoomPayload,
  Room,
  RoomFieldErrors,
  RoomFormMode,
  RoomFormValues,
  UpdateRoomPayload,
} from '@/types/room'

/** Aligné sur la contrainte de l'API (ROOM_NAME_MAX_LENGTH côté backend). */
export const ROOM_NAME_MAX_LENGTH = 255

export function createRoomFieldErrors(): RoomFieldErrors {
  return {}
}

export function createDefaultRoomFormValues(): RoomFormValues {
  return {
    name: '',
  }
}

export function getRoomFormValues(room: Room | null | undefined): RoomFormValues {
  if (!room) {
    return createDefaultRoomFormValues()
  }

  return {
    name: room.name,
  }
}

export function hasRoomFormErrors(errors: RoomFieldErrors): boolean {
  return Object.values(errors).some(Boolean)
}

export function validateRoomForm(form: RoomFormValues, t: TranslateFn): RoomFieldErrors {
  const errors = createRoomFieldErrors()
  const name = form.name.trim()

  if (name.length === 0) {
    errors.name = t('rooms.form.validation.nameRequired')
  } else if (name.length > ROOM_NAME_MAX_LENGTH) {
    errors.name = t('rooms.form.validation.nameTooLong')
  }

  return errors
}

export function buildCreateRoomPayload(form: RoomFormValues): CreateRoomPayload {
  return {
    name: form.name.trim(),
  }
}

export function buildUpdateRoomPayload(form: RoomFormValues): UpdateRoomPayload {
  return {
    name: form.name.trim(),
  }
}

export function getRoomApiFieldError(
  errorCode: string,
  t: TranslateFn
): { field: keyof RoomFieldErrors; message: string } | null {
  if (errorCode === 'room_name_already_exists') {
    return {
      field: 'name',
      message: t('rooms.form.errors.room_name_already_exists'),
    }
  }

  return null
}

export function getRoomApiFormError(errorCode: string, t: TranslateFn): string {
  const key = `rooms.form.errors.${errorCode}`
  const translated = t(key)

  return translated === key ? t('rooms.form.errors.default') : translated
}

export function getRoomFormTitleKey(mode: RoomFormMode): string {
  return mode === 'edit' ? 'rooms.form.editTitle' : 'rooms.form.createTitle'
}

export function getRoomFormSubmitKey(mode: RoomFormMode): string {
  return mode === 'edit' ? 'rooms.form.actions.update' : 'rooms.form.actions.create'
}
