import { confirmMock, setConfirmResult } from '@frontend-tests/_helpers/confirmMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import {
  loadCompanyRoomServiceMock,
  mockLoadCompanyRoomSchedule,
  mockUpdateRoomScheduleFailure,
  roomScheduleFixture,
  roomsFixture,
  updateRoomScheduleServiceMock,
} from '@frontend-tests/_helpers/roomsServiceMock'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import RoomSchedulePanel from '@/views/clients/rooms/RoomSchedulePanel.vue'

resetFrontendMocksBeforeEach()

type Wrapper = ReturnType<typeof mountWithFrontendMocks>

async function mountPanel(room = roomsFixture[0]): Promise<Wrapper> {
  const wrapper = mountWithFrontendMocks(RoomSchedulePanel, {
    props: {
      companyId: 1,
      room,
    },
  })

  await flushPromises()

  return wrapper
}

async function submit(wrapper: Wrapper): Promise<void> {
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

function day(wrapper: Wrapper, key: number) {
  return wrapper.find(`[data-day="${key}"]`)
}

async function toggleDay(wrapper: Wrapper, key: number): Promise<void> {
  await day(wrapper, key).find('[data-test="switch-field"]').trigger('click')
}

function fieldErrors(wrapper: Wrapper): string[] {
  return wrapper
    .findAll('[data-test="form-field-error"], .room-schedule__error')
    .map((error) => error.text())
}

function preview(wrapper: Wrapper): string {
  return wrapper.find('[data-schedule-preview]').text()
}

describe('views/clients/rooms/RoomSchedulePanel.vue', () => {
  it('reads the room again and shows an empty form when it has no schedule', async () => {
    const wrapper = await mountPanel()

    expect(loadCompanyRoomServiceMock).toHaveBeenCalledWith(1, 1)
    expect(wrapper.find('[data-test="base-card"]').attributes('data-title')).toBe(
      'rooms.schedule.title'
    )
    expect(wrapper.find('[data-schedule="unset"]').exists()).toBe(true)
    expect(wrapper.find('select[name="timezone"]').element).toHaveProperty('value', 'Europe/Paris')
    expect(wrapper.find('input[name="slotMinutes"]').element).toHaveProperty('value', '60')
    expect(wrapper.find('input[name="breakMinutes"]').element).toHaveProperty('value', '0')
    expect(wrapper.find('[data-day="1"]').attributes('data-open')).toBe('false')
    expect(wrapper.find('.room-schedule__disable').exists()).toBe(false)
    expect(preview(wrapper)).toContain('rooms.schedule.preview.empty')
  })

  it('shows the loading state while the room is being read', async () => {
    const wrapper = mountWithFrontendMocks(RoomSchedulePanel, {
      props: { companyId: 1, room: roomsFixture[0] },
    })

    expect(wrapper.find('[data-test="base-card"]').attributes('data-loading')).toBe('true')

    await flushPromises()

    expect(wrapper.find('[data-test="base-card"]').attributes('data-loading')).toBe('false')
  })

  it('fills the form with the saved schedule and previews its slots', async () => {
    mockLoadCompanyRoomSchedule({
      ...roomScheduleFixture,
      timezone: 'America/New_York',
      breakMinutes: 10,
      days: { '1': { opensAt: '10:00', firstSessionAt: '10:30', closesAt: '12:30' } },
    })

    const wrapper = await mountPanel()

    expect(wrapper.find('[data-schedule="set"]').exists()).toBe(true)
    expect(wrapper.find('select[name="timezone"]').element).toHaveProperty(
      'value',
      'America/New_York'
    )
    expect(wrapper.find('input[name="breakMinutes"]').element).toHaveProperty('value', '10')
    expect(day(wrapper, 1).attributes('data-open')).toBe('true')
    expect(day(wrapper, 1).find('input[name="firstSessionAt-1"]').element).toHaveProperty(
      'value',
      '10:30'
    )
    expect(day(wrapper, 2).attributes('data-open')).toBe('false')
    expect(wrapper.find('[data-preview-day="1"]').text()).toContain('10:30')
    expect(wrapper.find('[data-preview-day="2"]').exists()).toBe(false)
    expect(wrapper.find('.room-schedule__disable').exists()).toBe(true)
  })

  it('shows the load error and retries', async () => {
    loadCompanyRoomServiceMock.mockResolvedValueOnce({ ok: false, error: 'forbidden' })

    const wrapper = await mountPanel()

    expect(wrapper.find('[data-test="base-card"]').attributes('data-error')).toBe('forbidden')

    mockLoadCompanyRoomSchedule(roomScheduleFixture)
    await wrapper.find('[data-test="base-card-actions"] [data-test="ui-button"]').trigger('click')
    await flushPromises()

    expect(loadCompanyRoomServiceMock).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-test="base-card"]').attributes('data-error')).toBe('')
    expect(wrapper.find('[data-schedule="set"]').exists()).toBe(true)
  })

  it('updates the preview as the form changes', async () => {
    const wrapper = await mountPanel()

    await toggleDay(wrapper, 2)
    await day(wrapper, 2).find('input[name="opensAt-2"]').setValue('14:00')
    await day(wrapper, 2).find('input[name="closesAt-2"]').setValue('16:00')

    expect(wrapper.find('[data-preview-day="2"]').text()).toContain('14:00, 15:00')

    await wrapper.find('input[name="slotMinutes"]').setValue('30')

    expect(wrapper.find('[data-preview-day="2"]').text()).toContain('14:00, 14:30, 15:00, 15:30')
  })

  it('replaces the preview by a hint while the form is invalid', async () => {
    const wrapper = await mountPanel()

    await toggleDay(wrapper, 2)
    await wrapper.find('input[name="slotMinutes"]').setValue('3')

    expect(wrapper.find('[data-preview="blocked"]').exists()).toBe(true)
    expect(wrapper.find('[data-preview-day]').exists()).toBe(false)
  })

  it('validates the fields locally before calling the API', async () => {
    const wrapper = await mountPanel()

    // Aucune erreur affichée avant un envoi.
    await wrapper.find('input[name="slotMinutes"]').setValue('3')
    expect(fieldErrors(wrapper)).toEqual([])

    await wrapper.find('input[name="bookableDesks"]').setValue('9')
    await submit(wrapper)

    expect(fieldErrors(wrapper)).toEqual([
      'rooms.schedule.validation.slotMinutesInvalid',
      'rooms.schedule.validation.bookableDesksInvalid',
    ])
    expect(updateRoomScheduleServiceMock).not.toHaveBeenCalled()
  })

  it('rejects overlapping days before sending anything', async () => {
    const wrapper = await mountPanel()

    await toggleDay(wrapper, 6)
    await toggleDay(wrapper, 7)
    await day(wrapper, 6).find('input[name="closesAt-6"]').setValue('01:00')
    await day(wrapper, 7).find('input[name="opensAt-7"]').setValue('00:30')
    await submit(wrapper)

    expect(day(wrapper, 6).text()).toContain('rooms.schedule.validation.daysOverlap')
    expect(updateRoomScheduleServiceMock).not.toHaveBeenCalled()
  })

  it('rejects a time zone that does not exist', async () => {
    mockLoadCompanyRoomSchedule({ ...roomScheduleFixture, timezone: 'Mars/Olympus' })

    const wrapper = await mountPanel()

    await submit(wrapper)

    expect(fieldErrors(wrapper)).toEqual(['rooms.schedule.validation.timezoneInvalid'])
    expect(updateRoomScheduleServiceMock).not.toHaveBeenCalled()
  })

  it('saves the schedule, confirms it and emits the updated room', async () => {
    const wrapper = await mountPanel()

    await wrapper.find('select[name="timezone"]').setValue('America/New_York')
    await wrapper.find('input[name="slotMinutes"]').setValue('45')
    await wrapper.find('input[name="breakMinutes"]').setValue('15')
    await wrapper.find('input[name="bookableDesks"]').setValue('2')
    await wrapper.find('.room-schedule__field--switch [data-test="switch-field"]').trigger('click')
    await toggleDay(wrapper, 1)
    await day(wrapper, 1).find('input[name="firstSessionAt-1"]').setValue('10:30')
    await submit(wrapper)

    const expected = {
      timezone: 'America/New_York',
      slotMinutes: 45,
      breakMinutes: 15,
      bookableDesks: 2,
      publicBooking: true,
      days: { '1': { opensAt: '10:00', firstSessionAt: '10:30', closesAt: '22:00' } },
    }

    expect(updateRoomScheduleServiceMock).toHaveBeenCalledWith(1, 1, { schedule: expected })
    expect(wrapper.text()).toContain('rooms.schedule.success.saved')
    expect(wrapper.find('[data-schedule="set"]').exists()).toBe(true)
    expect(wrapper.emitted('saved')?.[0]?.[0]).toMatchObject({ id: 1, schedule: expected })
  })

  it('shows the server error as a form message and keeps the typed values', async () => {
    mockUpdateRoomScheduleFailure('invalid_body')

    const wrapper = await mountPanel()

    await wrapper.find('input[name="slotMinutes"]').setValue('30')
    await submit(wrapper)

    // Le mock i18n renvoie la clé : le message retombe sur le texte par défaut.
    expect(wrapper.find('[data-test="form-result-error"]').text()).toBe(
      'rooms.schedule.errors.default'
    )
    expect(wrapper.find('input[name="slotMinutes"]').element).toHaveProperty('value', '30')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('confirms in danger variant, then disables the schedule with null', async () => {
    mockLoadCompanyRoomSchedule(roomScheduleFixture)
    setConfirmResult(true)

    const wrapper = await mountPanel()

    await wrapper.find('.room-schedule__disable').trigger('click')
    await flushPromises()

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'rooms.schedule.actions.disableConfirm',
        variant: 'danger',
      })
    )
    expect(updateRoomScheduleServiceMock).toHaveBeenCalledWith(1, 1, { schedule: null })
    expect(wrapper.text()).toContain('rooms.schedule.success.disabled')
    expect(wrapper.find('[data-schedule="unset"]').exists()).toBe(true)
    expect(wrapper.find('.room-schedule__disable').exists()).toBe(false)
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it('keeps the schedule when the deactivation is cancelled or fails', async () => {
    mockLoadCompanyRoomSchedule(roomScheduleFixture)
    setConfirmResult(false)

    const wrapper = await mountPanel()

    await wrapper.find('.room-schedule__disable').trigger('click')
    await flushPromises()

    expect(updateRoomScheduleServiceMock).not.toHaveBeenCalled()

    setConfirmResult(true)
    mockUpdateRoomScheduleFailure('company_deleted')
    await wrapper.find('.room-schedule__disable').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="form-result-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-schedule="set"]').exists()).toBe(true)
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('emits close from the close button and the cancel button', async () => {
    const wrapper = await mountPanel()

    await wrapper.find('.room-schedule__close').trigger('click')
    await wrapper.find('[data-test="form-actions-cancel"]').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(2)
  })

  it('reads the schedule again when another room is selected', async () => {
    const wrapper = await mountPanel()

    await wrapper.setProps({ room: roomsFixture[1] })
    await flushPromises()

    expect(loadCompanyRoomServiceMock).toHaveBeenLastCalledWith(1, 2)
  })
})
