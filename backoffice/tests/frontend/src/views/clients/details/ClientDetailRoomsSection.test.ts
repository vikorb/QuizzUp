import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import {
  createCompanyRoomServiceMock,
  createRoomAccountServiceMock,
  deleteRoomAccountServiceMock,
  loadCompanyRoomsServiceMock,
  loadRoomAccountServiceMock,
  mockDeleteRoomFailure,
  mockLoadCompanyRoomsFailure,
  mockLoadRoomAccountSuccess,
  roomAccountFixture,
  updateCompanyRoomServiceMock,
} from '@frontend-tests/_helpers/roomsServiceMock'
import { ROOM_STATUS_DELETED } from '@quizzup/shared'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ClientDetailRoomsSection from '@/views/clients/details/room/ClientDetailRoomsSection.vue'

resetFrontendMocksBeforeEach()

type Access = 'superadmin' | 'admin' | 'user' | 'none'

const accessProps: Record<Access, Record<string, boolean>> = {
  superadmin: { canShowRoomsSection: true, canManageRooms: true, canSeeDeletedRooms: true },
  admin: { canShowRoomsSection: true, canManageRooms: true, canSeeDeletedRooms: false },
  user: { canShowRoomsSection: true, canManageRooms: false, canSeeDeletedRooms: false },
  none: { canShowRoomsSection: false, canManageRooms: false, canSeeDeletedRooms: false },
}

async function mountSection(access: Access) {
  const wrapper = mountWithFrontendMocks(ClientDetailRoomsSection, {
    props: {
      companyId: 1,
      ...accessProps[access],
    },
  })

  await flushPromises()

  return wrapper
}

function rowKeys(wrapper: ReturnType<typeof mountWithFrontendMocks>): string[] {
  return wrapper
    .findAll('[data-test="base-table-row"]')
    .map((row) => row.attributes('data-row-key') ?? '')
}

function rowAction(
  wrapper: ReturnType<typeof mountWithFrontendMocks>,
  roomId: number,
  action: 'account' | 'edit' | 'delete'
) {
  return wrapper.find(`[data-row-key="${roomId}"] [data-test="ui-button"].icon-${action}`)
}

function accountPanel(wrapper: ReturnType<typeof mountWithFrontendMocks>) {
  return wrapper.find('#room-account')
}

async function selectStatus(wrapper: ReturnType<typeof mountWithFrontendMocks>, value: string) {
  await wrapper.find('select').setValue(value)
  await flushPromises()
}

describe('views/clients/details/room/ClientDetailRoomsSection.vue', () => {
  it('renders nothing and calls no API without access', async () => {
    const wrapper = await mountSection('none')

    expect(wrapper.find('#rooms').exists()).toBe(false)
    expect(loadCompanyRoomsServiceMock).not.toHaveBeenCalled()
  })

  it('gives the user role a read-only list', async () => {
    const wrapper = await mountSection('user')

    expect(loadCompanyRoomsServiceMock).toHaveBeenCalledWith(1)
    expect(wrapper.find('[data-test="base-toolbar-primary"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="switch-field"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="ui-button"]').exists()).toBe(false)
    expect(
      wrapper.findAll('[data-test="base-table-header"]').map((th) => th.attributes('data-column'))
    ).not.toContain('actions')
    expect(rowKeys(wrapper)).toEqual(['1'])
  })

  it('never lists deleted rooms for admin and user, even with the "all" filter', async () => {
    for (const access of ['admin', 'user'] as const) {
      const wrapper = await mountSection(access)

      await selectStatus(wrapper, 'all')

      expect(rowKeys(wrapper)).toEqual(['1', '2'])
      expect(wrapper.findAll('option').map((option) => option.attributes('value'))).not.toContain(
        String(ROOM_STATUS_DELETED)
      )
    }
  })

  it('lets the superadmin filter deleted rooms', async () => {
    const wrapper = await mountSection('superadmin')

    await selectStatus(wrapper, String(ROOM_STATUS_DELETED))

    expect(rowKeys(wrapper)).toEqual(['3'])
  })

  it('searches rooms by name', async () => {
    const wrapper = await mountSection('admin')

    await selectStatus(wrapper, 'all')
    await wrapper.find('#rooms input').setValue('arcade')
    await flushPromises()

    expect(rowKeys(wrapper)).toEqual(['2'])
  })

  it('shows the load error on the table', async () => {
    mockLoadCompanyRoomsFailure('forbidden')

    const wrapper = await mountSection('admin')

    expect(wrapper.find('[data-test="base-card"]').attributes('data-error')).toBe('forbidden')
  })

  it('creates a room through the inline form and shows a success banner', async () => {
    const wrapper = await mountSection('admin')

    expect(wrapper.find('form').exists()).toBe(false)

    await wrapper.find('[data-test="base-toolbar-primary"]').trigger('click')

    expect(wrapper.find('form').exists()).toBe(true)

    await wrapper.find('input[name="name"]').setValue('Salle Laser')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(createCompanyRoomServiceMock).toHaveBeenCalledWith(1, { name: 'Salle Laser' })
    expect(wrapper.find('form').exists()).toBe(false)
    expect(rowKeys(wrapper)).toContain('42')
    expect(wrapper.find('[data-test="base-banner"]').text()).toContain('roomCreated')
  })

  it('renames a room from the row edit action', async () => {
    const wrapper = await mountSection('admin')

    await rowAction(wrapper, 1, 'edit').trigger('click')

    const input = wrapper.find('input[name="name"]')

    expect((input.element as HTMLInputElement).value).toBe('Salle Néon')

    await input.setValue('Salle Néon XL')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updateCompanyRoomServiceMock).toHaveBeenCalledWith(1, 1, { name: 'Salle Néon XL' })
    expect(wrapper.text()).toContain('Salle Néon XL')
    expect(wrapper.find('[data-test="base-banner"]').text()).toContain('roomRenamed')
  })

  it('closes the inline form on cancel', async () => {
    const wrapper = await mountSection('superadmin')

    await wrapper.find('[data-test="base-toolbar-primary"]').trigger('click')
    await wrapper.find('[data-test="form-actions-cancel"]').trigger('click')

    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('removes a deleted room from the admin list', async () => {
    const wrapper = await mountSection('admin')

    await rowAction(wrapper, 1, 'delete').trigger('click')
    await flushPromises()

    expect(rowKeys(wrapper)).toEqual([])
    expect(wrapper.find('[data-test="base-banner"]').text()).toContain('roomDeleted')

    await selectStatus(wrapper, 'all')

    expect(rowKeys(wrapper)).toEqual(['2'])
  })

  it('keeps a deleted room visible to the superadmin', async () => {
    const wrapper = await mountSection('superadmin')

    await rowAction(wrapper, 1, 'delete').trigger('click')
    await flushPromises()
    await selectStatus(wrapper, String(ROOM_STATUS_DELETED))

    expect(rowKeys(wrapper)).toEqual(['1', '3'])
  })

  it('opens the room account panel from the row and closes the room form', async () => {
    mockLoadRoomAccountSuccess(roomAccountFixture)

    const wrapper = await mountSection('admin')

    await wrapper.find('[data-test="base-toolbar-primary"]').trigger('click')
    expect(wrapper.find('#room-form').exists()).toBe(true)

    await rowAction(wrapper, 1, 'account').trigger('click')
    await flushPromises()

    expect(wrapper.find('#room-form').exists()).toBe(false)
    expect(accountPanel(wrapper).exists()).toBe(true)
    expect(loadRoomAccountServiceMock).toHaveBeenCalledWith(1, 1)
    expect(accountPanel(wrapper).text()).toContain('salle-neon')

    await accountPanel(wrapper).find('.room-account__close').trigger('click')

    expect(accountPanel(wrapper).exists()).toBe(false)
  })

  it('creates a room account and shows a success banner', async () => {
    const wrapper = await mountSection('admin')

    await rowAction(wrapper, 1, 'account').trigger('click')
    await flushPromises()

    const panel = accountPanel(wrapper)

    await panel.find('input[name="username"]').setValue('salle-neon')
    await panel.find('input[name="password"]').setValue('Secret123!')
    await panel.find('input[name="passwordConfirm"]').setValue('Secret123!')
    await panel.find('form').trigger('submit')
    await flushPromises()

    expect(createRoomAccountServiceMock).toHaveBeenCalledWith(1, 1, {
      username: 'salle-neon',
      password: 'Secret123!',
    })
    expect(wrapper.find('[data-test="base-banner"]').text()).toContain('roomAccountCreated')
    expect(accountPanel(wrapper).find('[data-account="set"]').exists()).toBe(true)
  })

  it('deletes a room account and shows a success banner', async () => {
    mockLoadRoomAccountSuccess(roomAccountFixture)

    const wrapper = await mountSection('admin')

    await rowAction(wrapper, 1, 'account').trigger('click')
    await flushPromises()
    await accountPanel(wrapper).find('.room-account__delete').trigger('click')
    await flushPromises()

    expect(deleteRoomAccountServiceMock).toHaveBeenCalledWith(1, 1)
    expect(wrapper.find('[data-test="base-banner"]').text()).toContain('roomAccountDeleted')
    expect(accountPanel(wrapper).find('[data-account="unset"]').exists()).toBe(true)
  })

  it('closes the room account panel when the room is deleted', async () => {
    const wrapper = await mountSection('admin')

    await rowAction(wrapper, 1, 'account').trigger('click')
    await flushPromises()
    expect(accountPanel(wrapper).exists()).toBe(true)

    await rowAction(wrapper, 1, 'delete').trigger('click')
    await flushPromises()

    expect(accountPanel(wrapper).exists()).toBe(false)
  })

  it('never offers the room account to the user role', async () => {
    const wrapper = await mountSection('user')

    expect(wrapper.find('.icon-account').exists()).toBe(false)
    expect(accountPanel(wrapper).exists()).toBe(false)
    expect(loadRoomAccountServiceMock).not.toHaveBeenCalled()
  })

  it('shows action errors in the banner', async () => {
    mockDeleteRoomFailure('server_error')

    const wrapper = await mountSection('admin')

    await rowAction(wrapper, 1, 'delete').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="base-banner"]').text()).toContain('server_error')
    expect(rowKeys(wrapper)).toEqual(['1'])
  })
})
