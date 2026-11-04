import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import {
  createCompanyRoomServiceMock,
  mockCreateCompanyRoomFailure,
  mockUpdateCompanyRoomFailure,
  roomsFixture,
  updateCompanyRoomServiceMock,
} from '@frontend-tests/_helpers/roomsServiceMock'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import RoomForm from '@/views/clients/rooms/RoomForm.vue'

resetFrontendMocksBeforeEach()

function mountForm(props: Record<string, unknown> = {}) {
  return mountWithFrontendMocks(RoomForm, {
    props: {
      mode: 'create',
      companyId: 1,
      ...props,
    },
  })
}

async function submit(wrapper: ReturnType<typeof mountWithFrontendMocks>): Promise<void> {
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

describe('views/clients/rooms/RoomForm.vue', () => {
  it('creates a room with a trimmed name', async () => {
    const wrapper = mountForm()

    expect(wrapper.find('[data-test="base-card"]').attributes('data-title')).toBe(
      'rooms.form.createTitle'
    )

    await wrapper.find('input[name="name"]').setValue('  Salle Néon  ')
    await submit(wrapper)

    expect(createCompanyRoomServiceMock).toHaveBeenCalledWith(1, { name: 'Salle Néon' })
    expect(wrapper.emitted('saved')?.[0]?.[0]).toMatchObject({ name: 'Salle Néon' })
  })

  it('blocks submission when the name is empty', async () => {
    const wrapper = mountForm()

    await submit(wrapper)

    expect(createCompanyRoomServiceMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="form-field-error"]').text()).toBe(
      'rooms.form.validation.nameRequired'
    )
  })

  it('shows a duplicate name on the name field', async () => {
    mockCreateCompanyRoomFailure('room_name_already_exists')

    const wrapper = mountForm()

    await wrapper.find('input[name="name"]').setValue('Salle Néon')
    await submit(wrapper)

    expect(wrapper.find('[data-test="form-field-error"]').text()).toBe(
      'rooms.form.errors.room_name_already_exists'
    )
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('shows other API errors as a form message', async () => {
    mockCreateCompanyRoomFailure('company_deleted')

    const wrapper = mountForm()

    await wrapper.find('input[name="name"]').setValue('Salle Néon')
    await submit(wrapper)

    // Le mock i18n renvoie la clé : getRoomApiFormError retombe donc sur le message par défaut.
    expect(wrapper.find('[data-test="form-result-error"]').text()).toBe('rooms.form.errors.default')
  })

  it('prefills and renames an existing room', async () => {
    const wrapper = mountForm({ mode: 'edit', room: roomsFixture[0] })

    expect(wrapper.find('[data-test="base-card"]').attributes('data-title')).toBe(
      'rooms.form.editTitle'
    )
    expect((wrapper.find('input[name="name"]').element as HTMLInputElement).value).toBe(
      'Salle Néon'
    )

    await wrapper.find('input[name="name"]').setValue('Salle Néon 2')
    await submit(wrapper)

    expect(updateCompanyRoomServiceMock).toHaveBeenCalledWith(1, 1, { name: 'Salle Néon 2' })
    expect(createCompanyRoomServiceMock).not.toHaveBeenCalled()
    expect(wrapper.emitted('saved')?.[0]?.[0]).toMatchObject({ id: 1, name: 'Salle Néon 2' })
  })

  it('reports a duplicate name when renaming', async () => {
    mockUpdateCompanyRoomFailure('room_name_already_exists')

    const wrapper = mountForm({ mode: 'edit', room: roomsFixture[0] })

    await submit(wrapper)

    expect(wrapper.find('[data-test="form-field-error"]').text()).toBe(
      'rooms.form.errors.room_name_already_exists'
    )
  })

  it('emits cancel', async () => {
    const wrapper = mountForm()

    await wrapper.find('[data-test="form-actions-cancel"]').trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })
})
