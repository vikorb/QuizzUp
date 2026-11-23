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
import { beforeEach, describe, expect, it, vi } from 'vitest'

import RoomSchedulePanel from '@/views/clients/rooms/RoomSchedulePanel.vue'

// Traductions que le double i18n connaît (par défaut il renvoie la clé).
const translations = vi.hoisted(() => ({}) as Record<string, string>)

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<{ useI18n: () => Record<string, unknown> }>()

  return {
    ...actual,
    useI18n: () => ({
      ...actual.useI18n(),
      t: (key: string) => translations[key] ?? key,
    }),
  }
})

resetFrontendMocksBeforeEach()

beforeEach(() => {
  for (const key of Object.keys(translations)) {
    delete translations[key]
  }
})

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
    // Le message de l'aperçu renvoie à des champs réellement marqués.
    expect(fieldErrors(wrapper)).toEqual(['rooms.schedule.validation.slotMinutesInvalid'])
    expect(wrapper.find('[data-schedule-preview]').attributes('aria-live')).toBeUndefined()
  })

  it('validates the fields locally before calling the API', async () => {
    const wrapper = await mountPanel()

    expect(fieldErrors(wrapper)).toEqual([])

    // L'erreur s'affiche dès que la valeur est invalide, sans attendre l'envoi.
    await wrapper.find('input[name="slotMinutes"]').setValue('3')
    expect(fieldErrors(wrapper)).toEqual(['rooms.schedule.validation.slotMinutesInvalid'])

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
    translations['rooms.schedule.errors.invalid_body'] = 'Réglages invalides'
    mockUpdateRoomScheduleFailure('invalid_body')

    const wrapper = await mountPanel()

    await wrapper.find('input[name="slotMinutes"]').setValue('30')
    await submit(wrapper)

    // Échoue si la clé demandée n'est pas exactement `rooms.schedule.errors.invalid_body`.
    expect(wrapper.find('[data-test="form-result-error"]').text()).toBe('Réglages invalides')
    expect(wrapper.find('input[name="slotMinutes"]').element).toHaveProperty('value', '30')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('falls back to the default message for an unknown server code', async () => {
    mockUpdateRoomScheduleFailure('something_new')

    const wrapper = await mountPanel()

    await submit(wrapper)

    expect(wrapper.find('[data-test="form-result-error"]').text()).toBe(
      'rooms.schedule.errors.default'
    )
  })

  it('confirms in danger variant, then disables the schedule with null', async () => {
    mockLoadCompanyRoomSchedule({ ...roomScheduleFixture, slotMinutes: 45 })
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

    // La saisie reste : un « Enregistrer » rétablit la salle avec les mêmes réglages.
    expect(wrapper.find('input[name="slotMinutes"]').element).toHaveProperty('value', '45')
    expect(day(wrapper, 1).attributes('data-open')).toBe('true')

    await submit(wrapper)

    expect(updateRoomScheduleServiceMock).toHaveBeenLastCalledWith(1, 1, {
      schedule: { ...roomScheduleFixture, slotMinutes: 45 },
    })
    expect(wrapper.find('[data-schedule="set"]').exists()).toBe(true)
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

  it('groups each day row under its name, so the time fields say which day they belong to', async () => {
    mockLoadCompanyRoomSchedule(roomScheduleFixture)

    const wrapper = await mountPanel()
    const monday = day(wrapper, 1)
    const name = wrapper.find(`#${monday.attributes('aria-labelledby')}`)

    expect(monday.attributes('role')).toBe('group')
    expect(name.text()).toBe('rooms.schedule.days.1')
    expect(monday.findAll('input[type="time"]')).toHaveLength(3)
  })

  it('makes the day name and the public booking text clickable labels of their switch', async () => {
    const wrapper = await mountPanel()
    const tuesday = day(wrapper, 2)
    const dayLabel = tuesday.find('label.room-schedule__day-label')

    expect(dayLabel.attributes('for')).toBe(
      tuesday.find('[data-test="switch-field"]').attributes('id')
    )

    await dayLabel.trigger('click')

    expect(tuesday.attributes('data-open')).toBe('true')

    const publicSwitch = wrapper.find('.room-schedule__field--switch [data-test="switch-field"]')
    const publicLabel = wrapper.find('label.room-schedule__switch-text')

    expect(publicLabel.attributes('for')).toBe(publicSwitch.attributes('id'))

    await publicLabel.trigger('click')

    expect(publicSwitch.attributes('aria-checked')).toBe('true')
  })

  it('links the day error to the three time fields of that day only', async () => {
    const wrapper = await mountPanel()

    await toggleDay(wrapper, 6)
    await toggleDay(wrapper, 7)
    await day(wrapper, 6).find('input[name="closesAt-6"]').setValue('01:00')
    await day(wrapper, 7).find('input[name="opensAt-7"]').setValue('00:30')

    const errorId = day(wrapper, 6).find('.room-schedule__day-error').attributes('id')
    const saturday = day(wrapper, 6).findAll('input[type="time"]')

    expect(errorId).toBeTruthy()
    expect(saturday).toHaveLength(3)

    for (const input of saturday) {
      expect(input.attributes('aria-invalid')).toBe('true')
      expect(input.attributes('aria-describedby')).toBe(errorId)
      expect(input.classes()).toContain('room-schedule__input--error')
    }

    for (const input of day(wrapper, 7).findAll('input[type="time"]')) {
      expect(input.attributes('aria-invalid')).toBe('false')
      expect(input.attributes('aria-describedby')).toBeUndefined()
    }
  })

  it('only disables the close button while saving or disabling', async () => {
    mockLoadCompanyRoomSchedule(roomScheduleFixture)

    const wrapper = mountWithFrontendMocks(RoomSchedulePanel, {
      props: { companyId: 1, room: roomsFixture[0] },
    })
    const close = () => wrapper.find('.room-schedule__close').attributes('disabled')

    // Chargement en cours : on peut fermer.
    expect(wrapper.find('[data-test="base-card"]').attributes('data-loading')).toBe('true')
    expect(close()).toBeUndefined()

    await flushPromises()

    let release: ((result: { ok: false; error: string }) => void) | undefined

    updateRoomScheduleServiceMock.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve))
    )
    await wrapper.find('form').trigger('submit')

    expect(close()).toBeDefined()

    release?.({ ok: false, error: 'server_error' })
    await flushPromises()

    expect(close()).toBeUndefined()
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
