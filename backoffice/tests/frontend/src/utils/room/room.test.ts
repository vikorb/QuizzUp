import {
  createRoomFixture,
  roomAccountFixture,
  roomsFixture,
} from '@frontend-tests/_helpers/roomsServiceMock'
import {
  ADMIN_ROLE_ADMIN,
  ADMIN_ROLE_ROOM,
  ADMIN_ROLE_SUPERADMIN,
  ADMIN_ROLE_USER,
  ROOM_STATUS_ACTIVE,
  ROOM_STATUS_DELETED,
  ROOM_STATUS_INACTIVE,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import {
  buildCreateRoomAccountPayload,
  createDefaultRoomAccountFormValues,
  formatRoomAccountDate,
  getRoomAccountApiFieldError,
  getRoomAccountApiFormError,
  hasRoomAccountFormErrors,
  ROOM_ACCOUNT_PASSWORD_MAX_LENGTH,
  ROOM_ACCOUNT_PASSWORD_MIN_LENGTH,
  ROOM_ACCOUNT_USERNAME_MAX_LENGTH,
  validateRoomAccountForm,
} from '@/utils/room/account'
import {
  createRoomAccountCreatedBanner,
  createRoomAccountDeletedBanner,
  createRoomDeletedBanner,
  createRoomSavedBanner,
  createRoomUpdatedBanner,
} from '@/utils/room/detailsBanner'
import {
  DEFAULT_ROOM_STATUS_FILTER,
  filterRooms,
  filterRoomsByStatus,
  filterVisibleRooms,
  getRoomStatusFilterOptions,
  hasRoomToolbarActiveFilters,
  parseRoomStatusFilter,
} from '@/utils/room/filters'
import {
  buildCreateRoomPayload,
  buildUpdateRoomPayload,
  getRoomApiFieldError,
  getRoomApiFormError,
  getRoomFormSubmitKey,
  getRoomFormTitleKey,
  getRoomFormValues,
  hasRoomFormErrors,
  ROOM_NAME_MAX_LENGTH,
  validateRoomForm,
} from '@/utils/room/form'
import {
  addRoomToList,
  findRoomById,
  getRoomDisplayName,
  hasRoomConfig,
  removeRoomFromList,
  toRoomTableRow,
  updateRoomInList,
} from '@/utils/room/list'
import {
  canManageCompanyRooms,
  canSeeDeletedRooms,
  canShowCompanyRoomsSection,
  isRoomAccountRole,
} from '@/utils/room/permissions'
import {
  getRoomUpdateSuccessCode,
  isRoomActive,
  isRoomDeleted,
  toRoomStatus,
} from '@/utils/room/status'

const t = (key: string) => key

// Simule une traduction connue pour company_deleted, la clé brute sinon.
const translateCompanyDeleted = (key: string) =>
  key === 'rooms.form.errors.company_deleted' ? 'Compagnie supprimée' : key

// Idem pour le compte de salle déjà existant.
const translateRoomAccountExists = (key: string) =>
  key === 'rooms.account.errors.room_account_already_exists' ? 'Déjà un compte' : key

const validRoomAccountForm = {
  username: 'salle-neon',
  password: 'Secret123!',
  passwordConfirm: 'Secret123!',
}

function roomAccountUsernameError(username: string): string | undefined {
  return validateRoomAccountForm({ ...validRoomAccountForm, username }, t).username
}

function roomAccountPasswordErrors(password: string, passwordConfirm = password) {
  return validateRoomAccountForm({ ...validRoomAccountForm, password, passwordConfirm }, t)
}

describe('utils/room/permissions.ts', () => {
  it('shows the rooms section to superadmin, admin and user', () => {
    expect(canShowCompanyRoomsSection(ADMIN_ROLE_SUPERADMIN)).toBe(true)
    expect(canShowCompanyRoomsSection(ADMIN_ROLE_ADMIN)).toBe(true)
    expect(canShowCompanyRoomsSection(ADMIN_ROLE_USER)).toBe(true)
    expect(canShowCompanyRoomsSection(ADMIN_ROLE_ROOM)).toBe(false)
    expect(canShowCompanyRoomsSection(null)).toBe(false)
    expect(canShowCompanyRoomsSection(undefined)).toBe(false)
  })

  it('reserves management to superadmin and admin', () => {
    expect(canManageCompanyRooms(ADMIN_ROLE_SUPERADMIN)).toBe(true)
    expect(canManageCompanyRooms(ADMIN_ROLE_ADMIN)).toBe(true)
    expect(canManageCompanyRooms(ADMIN_ROLE_USER)).toBe(false)
    expect(canManageCompanyRooms(null)).toBe(false)
  })

  it('recognises only the room role as a room account', () => {
    expect(isRoomAccountRole(ADMIN_ROLE_ROOM)).toBe(true)
    expect(isRoomAccountRole(ADMIN_ROLE_SUPERADMIN)).toBe(false)
    expect(isRoomAccountRole(ADMIN_ROLE_ADMIN)).toBe(false)
    expect(isRoomAccountRole(ADMIN_ROLE_USER)).toBe(false)
    expect(isRoomAccountRole(null)).toBe(false)
    expect(isRoomAccountRole(undefined)).toBe(false)
  })

  it('reserves deleted rooms to the superadmin', () => {
    expect(canSeeDeletedRooms(ADMIN_ROLE_SUPERADMIN)).toBe(true)
    expect(canSeeDeletedRooms(ADMIN_ROLE_ADMIN)).toBe(false)
    expect(canSeeDeletedRooms(ADMIN_ROLE_USER)).toBe(false)
  })
})

describe('utils/room/status.ts', () => {
  it('normalizes unknown values to active', () => {
    expect(toRoomStatus(ROOM_STATUS_INACTIVE)).toBe(ROOM_STATUS_INACTIVE)
    expect(toRoomStatus(ROOM_STATUS_DELETED)).toBe(ROOM_STATUS_DELETED)
    expect(toRoomStatus(ROOM_STATUS_ACTIVE)).toBe(ROOM_STATUS_ACTIVE)
    expect(toRoomStatus('nope')).toBe(ROOM_STATUS_ACTIVE)
  })

  it('detects active and deleted rooms', () => {
    expect(isRoomActive(ROOM_STATUS_ACTIVE)).toBe(true)
    expect(isRoomActive(ROOM_STATUS_INACTIVE)).toBe(false)
    expect(isRoomDeleted(ROOM_STATUS_DELETED)).toBe(true)
    expect(isRoomDeleted(ROOM_STATUS_ACTIVE)).toBe(false)
  })

  it('maps a status to its success banner code', () => {
    expect(getRoomUpdateSuccessCode(ROOM_STATUS_ACTIVE)).toBe('roomActivated')
    expect(getRoomUpdateSuccessCode(ROOM_STATUS_INACTIVE)).toBe('roomDisabled')
    expect(getRoomUpdateSuccessCode(ROOM_STATUS_DELETED)).toBe('roomDeleted')
  })
})

describe('utils/room/filters.ts', () => {
  it('offers the deleted filter only when deleted rooms are visible', () => {
    const values = getRoomStatusFilterOptions(t).map((option) => option.value)
    const superadminValues = getRoomStatusFilterOptions(t, true).map((option) => option.value)

    expect(values).toEqual([String(ROOM_STATUS_ACTIVE), String(ROOM_STATUS_INACTIVE), 'all'])
    expect(superadminValues).toEqual([
      String(ROOM_STATUS_ACTIVE),
      String(ROOM_STATUS_INACTIVE),
      String(ROOM_STATUS_DELETED),
      'all',
    ])
  })

  it('parses status filters and refuses deleted when not allowed', () => {
    expect(parseRoomStatusFilter('all', ROOM_STATUS_ACTIVE)).toBe('all')
    expect(parseRoomStatusFilter(String(ROOM_STATUS_INACTIVE), ROOM_STATUS_ACTIVE)).toBe(
      ROOM_STATUS_INACTIVE
    )
    expect(parseRoomStatusFilter(String(ROOM_STATUS_DELETED), ROOM_STATUS_ACTIVE)).toBe(
      ROOM_STATUS_ACTIVE
    )
    expect(parseRoomStatusFilter(String(ROOM_STATUS_DELETED), ROOM_STATUS_ACTIVE, true)).toBe(
      ROOM_STATUS_DELETED
    )
    expect(parseRoomStatusFilter('nope', 'all')).toBe('all')
  })

  it('detects active toolbar filters', () => {
    expect(hasRoomToolbarActiveFilters('', DEFAULT_ROOM_STATUS_FILTER)).toBe(false)
    expect(hasRoomToolbarActiveFilters('  ', DEFAULT_ROOM_STATUS_FILTER)).toBe(false)
    expect(hasRoomToolbarActiveFilters('néon', DEFAULT_ROOM_STATUS_FILTER)).toBe(true)
    expect(hasRoomToolbarActiveFilters('', 'all')).toBe(true)
  })

  it('searches rooms by name, case insensitive', () => {
    expect(filterRooms(roomsFixture, 'ARCADE').map((room) => room.id)).toEqual([2])
    expect(filterRooms(roomsFixture, '')).toHaveLength(roomsFixture.length)
  })

  it('filters rooms by status', () => {
    expect(filterRoomsByStatus(roomsFixture, ROOM_STATUS_ACTIVE).map((room) => room.id)).toEqual([
      1,
    ])
    expect(filterRoomsByStatus(roomsFixture, 'all')).toHaveLength(roomsFixture.length)
  })

  it('hides deleted rooms unless allowed', () => {
    expect(filterVisibleRooms(roomsFixture, false).map((room) => room.id)).toEqual([1, 2])
    expect(filterVisibleRooms(roomsFixture, true)).toHaveLength(3)
  })
})

describe('utils/room/list.ts', () => {
  it('finds, updates, adds and removes rooms', () => {
    const renamed = { ...roomsFixture[0], name: 'Renommée' }
    const created = createRoomFixture({ id: 10 })

    expect(findRoomById(roomsFixture, 2)?.name).toBe('Salle Arcade')
    expect(updateRoomInList(roomsFixture, renamed)[0].name).toBe('Renommée')
    expect(addRoomToList(roomsFixture, created).at(-1)?.id).toBe(10)
    expect(addRoomToList(roomsFixture, renamed)).toHaveLength(roomsFixture.length)
    expect(removeRoomFromList(roomsFixture, 1).map((room) => room.id)).toEqual([2, 3])
  })

  it('builds a display name with fallbacks', () => {
    const unnamed = createRoomFixture({ id: 9, name: '  ' })

    expect(getRoomDisplayName(roomsFixture[0])).toBe('Salle Néon')
    expect(getRoomDisplayName(unnamed, roomsFixture[1])).toBe('Salle Arcade')
    expect(getRoomDisplayName(unnamed)).toBe('#9')
  })

  it('tells whether a hardware configuration is set', () => {
    expect(hasRoomConfig({ buzzers: 4 })).toBe(true)
    expect(hasRoomConfig({})).toBe(false)
    expect(hasRoomConfig(null)).toBe(false)
    expect(hasRoomConfig(undefined)).toBe(false)
    expect(toRoomTableRow(roomsFixture[0]).hasConfig).toBe(true)
    expect(toRoomTableRow(roomsFixture[1]).hasConfig).toBe(false)
  })
})

describe('utils/room/form.ts', () => {
  it('validates the room name', () => {
    expect(validateRoomForm({ name: '  ' }, t)).toEqual({
      name: 'rooms.form.validation.nameRequired',
    })
    expect(validateRoomForm({ name: 'a'.repeat(ROOM_NAME_MAX_LENGTH + 1) }, t)).toEqual({
      name: 'rooms.form.validation.nameTooLong',
    })
    expect(hasRoomFormErrors(validateRoomForm({ name: 'Salle Néon' }, t))).toBe(false)
  })

  it('builds trimmed payloads with the name only', () => {
    expect(buildCreateRoomPayload({ name: '  Salle Néon ' })).toEqual({ name: 'Salle Néon' })
    expect(buildUpdateRoomPayload({ name: ' Arcade ' })).toEqual({ name: 'Arcade' })
  })

  it('prefills the form from a room', () => {
    expect(getRoomFormValues(roomsFixture[0])).toEqual({ name: 'Salle Néon' })
    expect(getRoomFormValues(null)).toEqual({ name: '' })
  })

  it('maps API errors to the name field or a form message', () => {
    expect(getRoomApiFieldError('room_name_already_exists', t)).toEqual({
      field: 'name',
      message: 'rooms.form.errors.room_name_already_exists',
    })
    expect(getRoomApiFieldError('server_error', t)).toBeNull()

    expect(getRoomApiFormError('company_deleted', translateCompanyDeleted)).toBe(
      'Compagnie supprimée'
    )
    expect(getRoomApiFormError('unexpected', translateCompanyDeleted)).toBe(
      'rooms.form.errors.default'
    )
  })

  it('picks title and submit keys by mode', () => {
    expect(getRoomFormTitleKey('create')).toBe('rooms.form.createTitle')
    expect(getRoomFormTitleKey('edit')).toBe('rooms.form.editTitle')
    expect(getRoomFormSubmitKey('create')).toBe('rooms.form.actions.create')
    expect(getRoomFormSubmitKey('edit')).toBe('rooms.form.actions.update')
  })
})

describe('utils/room/detailsBanner.ts', () => {
  it('creates success banners for status changes, deletion and saves', () => {
    expect(
      createRoomUpdatedBanner(roomsFixture, { ...roomsFixture[0], status: ROOM_STATUS_INACTIVE })
    ).toEqual({ variant: 'success', code: 'roomDisabled', params: { name: 'Salle Néon' } })

    expect(createRoomDeletedBanner(roomsFixture, 2)).toEqual({
      variant: 'success',
      code: 'roomDeleted',
      params: { name: 'Salle Arcade' },
    })
    expect(createRoomDeletedBanner(roomsFixture, 99).params).toEqual({ name: '#99' })

    expect(createRoomSavedBanner(roomsFixture[0], 'create').code).toBe('roomCreated')
    expect(createRoomSavedBanner(roomsFixture[0], 'edit').code).toBe('roomRenamed')
  })

  it('creates success banners for the room account', () => {
    expect(createRoomAccountCreatedBanner(roomsFixture, 1, roomAccountFixture)).toEqual({
      variant: 'success',
      code: 'roomAccountCreated',
      params: { username: 'salle-neon', name: 'Salle Néon' },
    })

    expect(createRoomAccountDeletedBanner(roomsFixture, 99, roomAccountFixture)).toEqual({
      variant: 'success',
      code: 'roomAccountDeleted',
      params: { username: 'salle-neon', name: '#99' },
    })
  })
})

describe('utils/room/account.ts', () => {
  it('starts from an empty form without errors', () => {
    expect(createDefaultRoomAccountFormValues()).toEqual({
      username: '',
      password: '',
      passwordConfirm: '',
    })
    expect(hasRoomAccountFormErrors({})).toBe(false)
    expect(hasRoomAccountFormErrors({ username: 'x' })).toBe(true)
  })

  it('accepts a valid form and builds a trimmed payload without the confirmation', () => {
    expect(hasRoomAccountFormErrors(validateRoomAccountForm(validRoomAccountForm, t))).toBe(false)
    expect(
      buildCreateRoomAccountPayload({ ...validRoomAccountForm, username: '  salle.neon_2  ' })
    ).toEqual({
      username: 'salle.neon_2',
      password: 'Secret123!',
    })
  })

  it('validates the username like the API', () => {
    expect(roomAccountUsernameError('   ')).toBe('rooms.account.validation.usernameRequired')
    expect(roomAccountUsernameError('ab')).toBe('rooms.account.validation.usernameTooShort')
    expect(roomAccountUsernameError('a'.repeat(ROOM_ACCOUNT_USERNAME_MAX_LENGTH + 1))).toBe(
      'rooms.account.validation.usernameTooLong'
    )
    expect(roomAccountUsernameError('salle néon')).toBe('rooms.account.validation.usernameInvalid')
    expect(roomAccountUsernameError('salle@neon')).toBe('rooms.account.validation.usernameInvalid')
    expect(roomAccountUsernameError('  abc  ')).toBeUndefined()
  })

  it('validates the password and its confirmation', () => {
    expect(roomAccountPasswordErrors('').password).toBe('rooms.account.validation.passwordRequired')
    expect(
      roomAccountPasswordErrors('a'.repeat(ROOM_ACCOUNT_PASSWORD_MIN_LENGTH - 1)).password
    ).toBe('rooms.account.validation.passwordTooShort')
    expect(
      roomAccountPasswordErrors('a'.repeat(ROOM_ACCOUNT_PASSWORD_MAX_LENGTH + 1)).password
    ).toBe('rooms.account.validation.passwordTooLong')
    expect(roomAccountPasswordErrors('Secret123!', '').passwordConfirm).toBe(
      'rooms.account.validation.passwordConfirmRequired'
    )
    expect(roomAccountPasswordErrors('Secret123!', 'Secret123?').passwordConfirm).toBe(
      'rooms.account.validation.passwordMismatch'
    )
  })

  it('maps API errors to the username field or to a form message', () => {
    expect(getRoomAccountApiFieldError('username_already_exists', t)).toEqual({
      field: 'username',
      message: 'rooms.account.errors.username_already_exists',
    })
    expect(getRoomAccountApiFieldError('room_account_already_exists', t)).toBeNull()
    expect(
      getRoomAccountApiFormError('room_account_already_exists', translateRoomAccountExists)
    ).toBe('Déjà un compte')
    expect(getRoomAccountApiFormError('unknown_code', t)).toBe('rooms.account.errors.default')
  })

  it('formats the creation date and keeps invalid values as is', () => {
    expect(formatRoomAccountDate('2026-03-01T10:00:00.000Z', 'fr')).toBe(
      new Date('2026-03-01T10:00:00.000Z').toLocaleDateString('fr')
    )
    expect(formatRoomAccountDate('not-a-date', 'fr')).toBe('not-a-date')
  })
})
