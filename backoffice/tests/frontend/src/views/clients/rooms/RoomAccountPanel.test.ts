import { confirmMock, setConfirmResult } from '@frontend-tests/_helpers/confirmMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import {
  createRoomAccountServiceMock,
  deleteRoomAccountServiceMock,
  loadRoomAccountServiceMock,
  mockCreateRoomAccountFailure,
  mockDeleteRoomAccountFailure,
  mockLoadRoomAccountFailure,
  mockLoadRoomAccountSuccess,
  roomAccountFixture,
  roomsFixture,
} from '@frontend-tests/_helpers/roomsServiceMock'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import RoomAccountPanel from '@/views/clients/rooms/RoomAccountPanel.vue'

resetFrontendMocksBeforeEach()

type Wrapper = ReturnType<typeof mountWithFrontendMocks>

async function mountPanel(room = roomsFixture[0]): Promise<Wrapper> {
  const wrapper = mountWithFrontendMocks(RoomAccountPanel, {
    props: {
      companyId: 1,
      room,
    },
  })

  await flushPromises()

  return wrapper
}

async function fillForm(
  wrapper: Wrapper,
  values: { username?: string; password?: string; passwordConfirm?: string } = {}
): Promise<void> {
  await wrapper.find('input[name="username"]').setValue(values.username ?? 'salle-neon')
  await wrapper.find('input[name="password"]').setValue(values.password ?? 'Secret123!')
  await wrapper
    .find('input[name="passwordConfirm"]')
    .setValue(values.passwordConfirm ?? values.password ?? 'Secret123!')
}

async function submit(wrapper: Wrapper): Promise<void> {
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

function fieldErrors(wrapper: Wrapper): string[] {
  return wrapper.findAll('[data-test="form-field-error"]').map((error) => error.text())
}

describe('views/clients/rooms/RoomAccountPanel.vue', () => {
  it('loads the account of the room and shows the creation form when there is none', async () => {
    const wrapper = await mountPanel()

    expect(loadRoomAccountServiceMock).toHaveBeenCalledWith(1, 1)
    expect(wrapper.find('[data-test="base-card"]').attributes('data-title')).toBe(
      'rooms.account.title'
    )
    expect(wrapper.find('[data-account="unset"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('rooms.account.state.unset')
    expect(wrapper.find('input[name="password"]').attributes('type')).toBe('password')
    expect(wrapper.find('input[name="passwordConfirm"]').attributes('type')).toBe('password')
    expect(wrapper.text()).toContain('rooms.account.hints.create')
  })

  it('shows the existing account username without any form', async () => {
    mockLoadRoomAccountSuccess(roomAccountFixture)

    const wrapper = await mountPanel()

    expect(wrapper.find('[data-account="set"]').exists()).toBe(true)
    expect(wrapper.find('.room-account__username').text()).toBe('salle-neon')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain('rooms.account.hints.delete')
  })

  it('shows the load error and retries', async () => {
    mockLoadRoomAccountFailure('forbidden')

    const wrapper = await mountPanel()

    expect(wrapper.find('[data-test="base-card"]').attributes('data-error')).toBe('forbidden')

    mockLoadRoomAccountSuccess(roomAccountFixture)
    await wrapper.find('[data-test="base-card-actions"] [data-test="ui-button"]').trigger('click')
    await flushPromises()

    expect(loadRoomAccountServiceMock).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-test="base-card"]').attributes('data-error')).toBe('')
    expect(wrapper.find('.room-account__username').text()).toBe('salle-neon')
  })

  it('creates the account with a trimmed username and emits it', async () => {
    const wrapper = await mountPanel()

    await fillForm(wrapper, { username: '  salle-neon  ' })
    await submit(wrapper)

    expect(createRoomAccountServiceMock).toHaveBeenCalledWith(1, 1, {
      username: 'salle-neon',
      password: 'Secret123!',
    })
    expect(wrapper.emitted('created')?.[0]?.[0]).toMatchObject({ username: 'salle-neon' })
    expect(wrapper.find('.room-account__username').text()).toBe('salle-neon')
  })

  it('validates the fields locally before calling the API', async () => {
    const wrapper = await mountPanel()

    await submit(wrapper)

    expect(fieldErrors(wrapper)).toEqual([
      'rooms.account.validation.usernameRequired',
      'rooms.account.validation.passwordRequired',
      'rooms.account.validation.passwordConfirmRequired',
    ])

    await fillForm(wrapper, { username: 'ab', password: 'short', passwordConfirm: 'short' })
    await submit(wrapper)

    expect(fieldErrors(wrapper)).toEqual([
      'rooms.account.validation.usernameTooShort',
      'rooms.account.validation.passwordTooShort',
    ])
    expect(createRoomAccountServiceMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid username and a password confirmation mismatch', async () => {
    const wrapper = await mountPanel()

    await fillForm(wrapper, {
      username: 'salle néon',
      password: 'Secret123!',
      passwordConfirm: 'Secret123?',
    })
    await submit(wrapper)

    expect(fieldErrors(wrapper)).toEqual([
      'rooms.account.validation.usernameInvalid',
      'rooms.account.validation.passwordMismatch',
    ])
    expect(createRoomAccountServiceMock).not.toHaveBeenCalled()
  })

  it('shows a taken username on the username field', async () => {
    mockCreateRoomAccountFailure('username_already_exists')

    const wrapper = await mountPanel()

    await fillForm(wrapper)
    await submit(wrapper)

    expect(fieldErrors(wrapper)).toEqual(['rooms.account.errors.username_already_exists'])
    expect(wrapper.emitted('created')).toBeUndefined()
  })

  it('shows the existing account when the room already has one', async () => {
    mockCreateRoomAccountFailure('room_account_already_exists')

    const wrapper = await mountPanel()

    mockLoadRoomAccountSuccess(roomAccountFixture)
    await fillForm(wrapper)
    await submit(wrapper)

    expect(wrapper.find('.room-account__username').text()).toBe('salle-neon')
    expect(wrapper.emitted('error')).toEqual([['room_account_already_exists']])
    expect(wrapper.emitted('created')).toBeUndefined()
  })

  it('shows other API errors as a form message', async () => {
    mockCreateRoomAccountFailure('server_error')

    const wrapper = await mountPanel()

    await fillForm(wrapper)
    await submit(wrapper)

    // Le mock i18n renvoie la clé : getRoomAccountApiFormError retombe sur le message par défaut.
    expect(wrapper.find('[data-test="form-result-error"]').text()).toBe(
      'rooms.account.errors.default'
    )
  })

  it('confirms in danger variant, warns about the room PC and deletes the account', async () => {
    mockLoadRoomAccountSuccess(roomAccountFixture)
    setConfirmResult(true)

    const wrapper = await mountPanel()

    await wrapper.find('.room-account__delete').trigger('click')
    await flushPromises()

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'rooms.account.actions.deleteConfirm',
        variant: 'danger',
      })
    )
    expect(deleteRoomAccountServiceMock).toHaveBeenCalledWith(1, 1)
    expect(wrapper.emitted('deleted')?.[0]?.[0]).toMatchObject({ username: 'salle-neon' })
    expect(wrapper.find('[data-account="unset"]').exists()).toBe(true)
  })

  it('keeps the account when the deletion is cancelled', async () => {
    mockLoadRoomAccountSuccess(roomAccountFixture)
    setConfirmResult(false)

    const wrapper = await mountPanel()

    await wrapper.find('.room-account__delete').trigger('click')
    await flushPromises()

    expect(deleteRoomAccountServiceMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-account="set"]').exists()).toBe(true)
  })

  it('falls back to "no account" when the account was already deleted', async () => {
    mockLoadRoomAccountSuccess(roomAccountFixture)
    mockDeleteRoomAccountFailure('room_account_not_found')

    const wrapper = await mountPanel()

    await wrapper.find('.room-account__delete').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('error')).toEqual([['room_account_not_found']])
    expect(wrapper.emitted('deleted')).toBeUndefined()
    expect(wrapper.find('[data-account="unset"]').exists()).toBe(true)
  })

  it('keeps the account and reports other deletion errors', async () => {
    mockLoadRoomAccountSuccess(roomAccountFixture)
    mockDeleteRoomAccountFailure('server_error')

    const wrapper = await mountPanel()

    await wrapper.find('.room-account__delete').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('error')).toEqual([['server_error']])
    expect(wrapper.find('[data-account="set"]').exists()).toBe(true)
  })

  it('emits close from the close button and the form cancel button', async () => {
    const wrapper = await mountPanel()

    await wrapper.find('.room-account__close').trigger('click')
    await wrapper.find('[data-test="form-actions-cancel"]').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(2)
  })

  it('reloads the account when another room is selected', async () => {
    const wrapper = await mountPanel()

    await wrapper.setProps({ room: roomsFixture[1] })
    await flushPromises()

    expect(loadRoomAccountServiceMock).toHaveBeenLastCalledWith(1, 2)
  })
})
