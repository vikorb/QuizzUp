import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { roomsFixture } from '@frontend-tests/_helpers/roomsServiceMock'
import { describe, expect, it } from 'vitest'

import RoomsTable from '@/views/clients/rooms/RoomsTable.vue'

resetFrontendMocksBeforeEach()

const roomTableActionsStub = {
  name: 'RoomTableActions',
  emits: ['edit', 'updated', 'deleted', 'error'],
  template: `
    <div data-test="room-table-actions-stub">
      <button data-test="actions-edit" @click="$emit('edit', 1)" />
      <button data-test="actions-updated" @click="$emit('updated', { id: 1 })" />
      <button data-test="actions-deleted" @click="$emit('deleted', 1)" />
      <button data-test="actions-error" @click="$emit('error', 'server_error')" />
    </div>
  `,
}

function mountTable(props: Record<string, unknown> = {}) {
  return mountWithFrontendMocks(RoomsTable, {
    props: {
      companyId: 1,
      rooms: roomsFixture,
      loading: false,
      error: null,
      canManage: true,
      ...props,
    },
    global: {
      stubs: {
        roomTableActions: roomTableActionsStub,
      },
    },
  })
}

describe('views/clients/rooms/RoomsTable.vue', () => {
  it('renders room rows with status and hardware configuration', () => {
    const wrapper = mountTable()
    const configCells = wrapper.findAll('[data-test="base-table-cell-hasConfig"] [data-config]')

    expect(wrapper.findAll('[data-test="base-table-row"]')).toHaveLength(3)
    expect(wrapper.text()).toContain('Salle Néon')
    expect(wrapper.text()).toContain('rooms.status.active')
    expect(wrapper.text()).toContain('rooms.status.inactive')
    expect(wrapper.text()).toContain('rooms.status.deleted')
    expect(configCells.map((cell) => cell.attributes('data-config'))).toEqual([
      'set',
      'unset',
      'unset',
    ])
    expect(wrapper.text()).toContain('rooms.config.set')
    expect(wrapper.text()).toContain('rooms.config.unset')
  })

  it('shows the actions column for managers only', () => {
    const managerWrapper = mountTable({ canManage: true })
    const readonlyWrapper = mountTable({ canManage: false })

    expect(
      managerWrapper
        .findAll('[data-test="base-table-header"]')
        .map((th) => th.attributes('data-column'))
    ).toContain('actions')
    expect(managerWrapper.findAll('[data-test="room-table-actions-stub"]')).toHaveLength(3)

    expect(
      readonlyWrapper
        .findAll('[data-test="base-table-header"]')
        .map((th) => th.attributes('data-column'))
    ).not.toContain('actions')
    expect(readonlyWrapper.find('[data-test="room-table-actions-stub"]').exists()).toBe(false)
  })

  it('renders loading, empty and error states through BaseCard', async () => {
    const loadingWrapper = mountTable({ rooms: [], loading: true })

    expect(loadingWrapper.find('[data-test="base-card"]').attributes('data-loading')).toBe('true')

    const emptyWrapper = mountTable({ rooms: [] })

    expect(emptyWrapper.find('[data-test="base-card"]').attributes('data-empty')).toBe('true')

    const errorWrapper = mountTable({ rooms: [], error: 'server_error' })

    expect(errorWrapper.find('[data-test="base-card"]').attributes('data-error')).toBe(
      'server_error'
    )

    await errorWrapper
      .find('[data-test="base-card-actions"] [data-test="ui-button"]')
      .trigger('click')

    expect(errorWrapper.emitted('retry')).toHaveLength(1)
  })

  it('forwards child action events', async () => {
    const wrapper = mountTable({ rooms: [roomsFixture[0]] })

    await wrapper.find('[data-test="actions-edit"]').trigger('click')
    await wrapper.find('[data-test="actions-updated"]').trigger('click')
    await wrapper.find('[data-test="actions-deleted"]').trigger('click')
    await wrapper.find('[data-test="actions-error"]').trigger('click')

    expect(wrapper.emitted('edit')).toEqual([[1]])
    expect(wrapper.emitted('updated')).toEqual([[{ id: 1 }]])
    expect(wrapper.emitted('deleted')).toEqual([[1]])
    expect(wrapper.emitted('error')).toEqual([['server_error']])
  })
})
