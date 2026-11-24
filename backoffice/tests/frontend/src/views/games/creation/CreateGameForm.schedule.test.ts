import {
  createGameServiceMock,
  createParticipantFixture,
  createScheduledGameFixture,
  createScheduleFixture,
  mockServiceFailure,
  resetGamesServiceMock,
  roomsFixture,
  updateGameServiceMock,
} from '@frontend-tests/_helpers/gamesServiceMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Game, GameRoom } from '@/types/game'
import type { GamePrefill } from '@/utils/game/form'
import CreateGameForm from '@/views/games/creation/CreateGameForm.vue'

vi.mock('@/services/gamesService', async () => {
  const gamesService = await import('@frontend-tests/_helpers/gamesServiceMock')

  return gamesService.gamesServiceModuleMock
})

resetFrontendMocksBeforeEach()

beforeEach(() => {
  resetGamesServiceMock()
})

// Salle 10 à Paris (UTC+1 en décembre), salle 11 à Londres (UTC+0).
const rooms: GameRoom[] = [
  { ...roomsFixture[0], schedule: createScheduleFixture() },
  { ...roomsFixture[1], schedule: createScheduleFixture(undefined, 'Europe/London') },
]

function mountForm(
  props: { rooms?: GameRoom[]; game?: Game | null; prefill?: GamePrefill } = {}
): VueWrapper {
  return mountWithFrontendMocks(CreateGameForm, {
    props: { companyId: 1, rooms, ...props },
  })
}

function roomSelect(wrapper: VueWrapper) {
  return wrapper.findAll('[data-test="select-field"]')[0]
}

function input(wrapper: VueWrapper, name: string) {
  return wrapper.get<HTMLInputElement>(`input[name="${name}"]`)
}

function dateError(wrapper: VueWrapper): string | undefined {
  const error = wrapper.find('[data-name="scheduledDate"] [data-test="form-field-error"]')

  return error.exists() ? error.text() : undefined
}

function participants(wrapper: VueWrapper) {
  return wrapper.findAll('fieldset.participant')
}

async function submit(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

async function schedule(wrapper: VueWrapper, date = '2026-12-05', time = '14:00'): Promise<void> {
  await wrapper.get('[data-test="game-scheduled"]').setValue(true)
  await input(wrapper, 'scheduledDate').setValue(date)
  await input(wrapper, 'scheduledTime').setValue(time)
}

const editedGame = createScheduledGameFixture('2026-12-05T13:00:00.000Z', {
  id: 5,
  roomId: 10,
  roundsCount: 8,
  questionsPerRound: 6,
  playersCount: 7,
  participants: [
    createParticipantFixture({
      id: 1,
      podium: 1,
      displayName: 'Team A',
      email: 'a@quizzup.test',
      hasEmail: true,
      consentAt: '2026-11-03T10:00:00.000Z',
    }),
  ],
})

describe('views/games/creation/CreateGameForm.vue: programmer une session', () => {
  describe('création immédiate', () => {
    it('offers the schedule box, unticked, and shows no date or time field', () => {
      const wrapper = mountForm()

      expect(wrapper.get<HTMLInputElement>('[data-test="game-scheduled"]').element.checked).toBe(
        false
      )
      expect(wrapper.find('input[name="scheduledDate"]').exists()).toBe(false)
      expect(wrapper.find('input[name="scheduledTime"]').exists()).toBe(false)
      expect(participants(wrapper)).toHaveLength(1)
      expect(wrapper.get('[data-test="form-actions-submit"]').text()).toContain('games.form.submit')
    })

    it('still sends a plain game, with no schedule field', async () => {
      const wrapper = mountForm()

      await roomSelect(wrapper).get('select').setValue('10')
      await input(wrapper, 'participants.0.displayName').setValue('Team A')
      await submit(wrapper)

      expect(createGameServiceMock).toHaveBeenCalledTimes(1)
      const payload = createGameServiceMock.mock.calls[0][1] as Record<string, unknown>
      expect(payload).not.toHaveProperty('scheduledAt')
      expect(payload).not.toHaveProperty('durationMinutes')
      expect(payload).not.toHaveProperty('playersCount')
      expect(updateGameServiceMock).not.toHaveBeenCalled()
      expect(wrapper.emitted('created')).toHaveLength(1)
    })
  })

  describe('programmation', () => {
    it('shows the date, time, duration and headcount once the box is ticked, with no blank player', async () => {
      const wrapper = mountForm()

      await wrapper.get('[data-test="game-scheduled"]').setValue(true)

      for (const name of ['scheduledDate', 'scheduledTime', 'durationMinutes', 'playersCount']) {
        expect(wrapper.find(`input[name="${name}"]`).exists()).toBe(true)
      }
      expect(input(wrapper, 'scheduledDate').attributes('type')).toBe('date')
      expect(input(wrapper, 'scheduledTime').attributes('type')).toBe('time')
      expect(wrapper.get('[data-test="game-schedule-timezone"]').text()).toContain(
        'games.form.scheduleTimezone'
      )
      expect(participants(wrapper)).toHaveLength(0)
      expect(wrapper.get('[data-test="form-actions-submit"]').text()).toContain(
        'games.form.submitScheduled'
      )
    })

    it('sends the session, read in the time zone of the room, with no player at all', async () => {
      const wrapper = mountForm()

      await roomSelect(wrapper).get('select').setValue('10')
      await schedule(wrapper)
      await input(wrapper, 'playersCount').setValue('6')
      await input(wrapper, 'durationMinutes').setValue('90')
      await submit(wrapper)

      expect(createGameServiceMock).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          roomId: 10,
          // 14:00 à Paris, en décembre.
          scheduledAt: '2026-12-05T13:00:00.000Z',
          durationMinutes: 90,
          playersCount: 6,
          participants: [],
        })
      )
      expect(wrapper.emitted('created')).toHaveLength(1)
    })

    it('reads the same time one hour later in UTC for a room in London', async () => {
      const wrapper = mountForm()

      await roomSelect(wrapper).get('select').setValue('11')
      await schedule(wrapper)
      await submit(wrapper)

      expect(createGameServiceMock).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ roomId: 11, scheduledAt: '2026-12-05T14:00:00.000Z' })
      )
    })

    it('lets the operator add players to a scheduled session', async () => {
      const wrapper = mountForm()

      await roomSelect(wrapper).get('select').setValue('10')
      await schedule(wrapper)
      await wrapper.get('[data-test="game-add-participant"]').trigger('click')
      await input(wrapper, 'participants.0.displayName').setValue('Team A')
      await submit(wrapper)

      const payload = createGameServiceMock.mock.calls[0][1] as { participants: unknown[] }
      expect(payload.participants).toHaveLength(1)
    })

    it('asks for the day and the time before calling the API', async () => {
      const wrapper = mountForm()

      await roomSelect(wrapper).get('select').setValue('10')
      await wrapper.get('[data-test="game-scheduled"]').setValue(true)
      await input(wrapper, 'scheduledDate').setValue('2026-12-05')
      await submit(wrapper)

      expect(createGameServiceMock).not.toHaveBeenCalled()
      expect(dateError(wrapper)).toBe('games.form.errors.scheduledAtRequired')
    })

    it('refuses a duration and a headcount out of range', async () => {
      const wrapper = mountForm()

      await roomSelect(wrapper).get('select').setValue('10')
      await schedule(wrapper)
      await input(wrapper, 'durationMinutes').setValue('5')
      await input(wrapper, 'playersCount').setValue('13')
      await submit(wrapper)

      expect(createGameServiceMock).not.toHaveBeenCalled()
      const errors = wrapper.findAll('[data-test="form-field-error"]').map((node) => node.text())
      expect(errors).toEqual([
        'games.form.errors.durationInvalid',
        'games.form.errors.playersCountInvalid',
      ])
    })

    it('puts a player back when the box is unticked, and sends a plain game again', async () => {
      const wrapper = mountForm()

      await roomSelect(wrapper).get('select').setValue('10')
      await schedule(wrapper)
      await wrapper.get('[data-test="game-scheduled"]').setValue(false)

      expect(participants(wrapper)).toHaveLength(1)
      expect(wrapper.find('input[name="scheduledDate"]').exists()).toBe(false)

      await input(wrapper, 'participants.0.displayName').setValue('Team A')
      await submit(wrapper)

      expect(createGameServiceMock.mock.calls[0][1]).not.toHaveProperty('scheduledAt')
    })

    it.each([
      ['slot_taken', 'games.errors.slotTaken', 409],
      ['session_in_past', 'games.errors.sessionInPast', 400],
      ['session_too_far', 'games.errors.sessionTooFar', 400],
    ])('shows %s next to the date field', async (code, key, status) => {
      mockServiceFailure(createGameServiceMock, code, status)
      const wrapper = mountForm()

      await roomSelect(wrapper).get('select').setValue('10')
      await schedule(wrapper)
      await submit(wrapper)

      expect(dateError(wrapper)).toBe(key)
      expect(wrapper.find('[data-test="form-result-error"]').exists()).toBe(false)
      expect(wrapper.emitted('created')).toBeUndefined()
    })

    it('keeps the busy room error on the room field', async () => {
      mockServiceFailure(createGameServiceMock, 'room_busy', 409)
      const wrapper = mountForm()

      await roomSelect(wrapper).get('select').setValue('10')
      await schedule(wrapper)
      await submit(wrapper)

      expect(roomSelect(wrapper).attributes('error')).toBe('games.errors.roomBusy')
      expect(dateError(wrapper)).toBeUndefined()
    })

    it('clears the date error when the form is sent again', async () => {
      mockServiceFailure(createGameServiceMock, 'slot_taken', 409)
      const wrapper = mountForm()

      await roomSelect(wrapper).get('select').setValue('10')
      await schedule(wrapper)
      await submit(wrapper)
      createGameServiceMock.mockResolvedValue({
        ok: true,
        status: 201,
        data: { game: createScheduledGameFixture('2026-12-05T13:00:00.000Z', { id: 9 }) },
      })
      await input(wrapper, 'scheduledTime').setValue('16:00')
      await submit(wrapper)

      expect(dateError(wrapper)).toBeUndefined()
      expect(wrapper.emitted('created')).toHaveLength(1)
    })
  })

  describe('préremplissage par l’adresse', () => {
    it('chooses the room and fills the day and time of the slot', async () => {
      const wrapper = mountForm({
        prefill: { roomId: 10, scheduledAt: '2026-12-05T13:00:00.000Z' },
      })
      await flushPromises()

      expect(roomSelect(wrapper).get('select').element.value).toBe('10')
      expect(wrapper.get<HTMLInputElement>('[data-test="game-scheduled"]').element.checked).toBe(
        true
      )
      expect(input(wrapper, 'scheduledDate').element.value).toBe('2026-12-05')
      expect(input(wrapper, 'scheduledTime').element.value).toBe('14:00')
      expect(participants(wrapper)).toHaveLength(0)

      await submit(wrapper)

      expect(createGameServiceMock).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ roomId: 10, scheduledAt: '2026-12-05T13:00:00.000Z' })
      )
    })

    it('waits for the rooms when they are still loading', async () => {
      const wrapper = mountForm({
        rooms: [],
        prefill: { roomId: 11, scheduledAt: '2026-12-05T14:00:00.000Z' },
      })

      expect(wrapper.find('input[name="scheduledDate"]').exists()).toBe(false)

      await wrapper.setProps({ rooms })

      expect(roomSelect(wrapper).get('select').element.value).toBe('11')
      expect(input(wrapper, 'scheduledDate').element.value).toBe('2026-12-05')
      // 14:00Z à Londres : la salle 11 est à UTC+0.
      expect(input(wrapper, 'scheduledTime').element.value).toBe('14:00')
    })

    it('applies the prefill only once: the operator can untick the box afterwards', async () => {
      const wrapper = mountForm({
        prefill: { roomId: 10, scheduledAt: '2026-12-05T13:00:00.000Z' },
      })
      await flushPromises()

      await wrapper.get('[data-test="game-scheduled"]').setValue(false)
      await wrapper.setProps({ rooms: [...rooms] })

      expect(wrapper.get<HTMLInputElement>('[data-test="game-scheduled"]').element.checked).toBe(
        false
      )
    })

    it('ignores an unknown room and leaves the form as it is', async () => {
      const wrapper = mountForm({ prefill: { roomId: 99, scheduledAt: undefined } })
      await flushPromises()

      expect(roomSelect(wrapper).get('select').element.value).not.toBe('99')
      expect(wrapper.find('input[name="scheduledDate"]').exists()).toBe(false)
      expect(participants(wrapper)).toHaveLength(1)
    })
  })

  describe('modification d’une session programmée', () => {
    it('opens filled with the session, with no schedule box', () => {
      const wrapper = mountForm({ game: editedGame })

      expect(wrapper.find('[data-test="game-scheduled"]').exists()).toBe(false)
      expect(roomSelect(wrapper).get('select').element.value).toBe('10')
      expect(input(wrapper, 'scheduledDate').element.value).toBe('2026-12-05')
      expect(input(wrapper, 'scheduledTime').element.value).toBe('14:00')
      expect(input(wrapper, 'durationMinutes').element.value).toBe('60')
      expect(input(wrapper, 'playersCount').element.value).toBe('7')
      expect(input(wrapper, 'roundsCount').element.value).toBe('8')
      expect(input(wrapper, 'participants.0.displayName').element.value).toBe('Team A')
      expect(wrapper.get('[data-test="form-actions-submit"]').text()).toContain('games.form.save')
    })

    it('calls the modification, not the creation, and sends only what the server controls if changed', async () => {
      const wrapper = mountForm({ game: editedGame })

      await input(wrapper, 'scheduledTime').setValue('15:30')
      await submit(wrapper)

      expect(createGameServiceMock).not.toHaveBeenCalled()
      expect(updateGameServiceMock).toHaveBeenCalledTimes(1)
      const [companyId, gameId, payload] = updateGameServiceMock.mock.calls[0]
      expect(companyId).toBe(1)
      expect(gameId).toBe(5)
      expect(payload).toMatchObject({
        roomId: 10,
        scheduledAt: '2026-12-05T14:30:00.000Z',
        playersCount: 7,
        miniGames: null,
        participants: [
          {
            podium: 1,
            displayName: 'Team A',
            email: 'a@quizzup.test',
            emailConsent: true,
          },
        ],
      })
      expect(payload).not.toHaveProperty('roundsCount')
      expect(payload).not.toHaveProperty('durationMinutes')
      expect(wrapper.emitted('saved')).toHaveLength(1)
      expect(wrapper.emitted('created')).toBeUndefined()
    })

    it('does not send the start of a session again when it did not move', async () => {
      const wrapper = mountForm({ game: editedGame })

      await input(wrapper, 'playersCount').setValue('')
      await submit(wrapper)

      const payload = updateGameServiceMock.mock.calls[0][2] as Record<string, unknown>
      expect(payload).not.toHaveProperty('scheduledAt')
      expect(payload.playersCount).toBeNull()
    })

    it('validates the day and time like a creation', async () => {
      const wrapper = mountForm({ game: editedGame })

      await input(wrapper, 'scheduledDate').setValue('')
      await submit(wrapper)

      expect(updateGameServiceMock).not.toHaveBeenCalled()
      expect(dateError(wrapper)).toBe('games.form.errors.scheduledAtRequired')
    })

    it.each([
      ['slot_taken', 'games.errors.slotTaken'],
      ['session_in_past', 'games.errors.sessionInPast'],
      ['session_too_far', 'games.errors.sessionTooFar'],
    ])('shows %s next to the date field', async (code, key) => {
      mockServiceFailure(updateGameServiceMock, code, 409)
      const wrapper = mountForm({ game: editedGame })

      await input(wrapper, 'scheduledTime').setValue('15:30')
      await submit(wrapper)

      expect(dateError(wrapper)).toBe(key)
      expect(wrapper.emitted('saved')).toBeUndefined()
    })

    it.each([
      ['game_not_scheduled', 'games.errors.gameNotScheduled'],
      ['podium_not_in_room', 'games.errors.podiumNotInRoom'],
      ['invalid_body', 'games.errors.invalidBody'],
      ['server_error', 'games.errors.serverError'],
    ])('shows %s as a form error', async (code, key) => {
      mockServiceFailure(updateGameServiceMock, code, 409)
      const wrapper = mountForm({ game: editedGame })

      await submit(wrapper)

      expect(wrapper.get('[data-test="form-result-error"]').text()).toBe(key)
      expect(wrapper.emitted('saved')).toBeUndefined()
    })

    it('shows a room error on the room field', async () => {
      mockServiceFailure(updateGameServiceMock, 'room_inactive', 409)
      const wrapper = mountForm({ game: editedGame })

      await submit(wrapper)

      expect(roomSelect(wrapper).attributes('error')).toBe('games.errors.roomInactive')
    })

    it('shows a network failure as a server error', async () => {
      updateGameServiceMock.mockRejectedValue(new Error('network'))
      const wrapper = mountForm({ game: editedGame })

      await submit(wrapper)

      expect(wrapper.get('[data-test="form-result-error"]').text()).toBe('games.errors.serverError')
    })

    it('locks the players when their emails are masked, and does not send them', async () => {
      const masked = createScheduledGameFixture('2026-12-05T13:00:00.000Z', {
        id: 6,
        roomId: 10,
        participants: [createParticipantFixture({ email: null, hasEmail: true })],
      })
      const wrapper = mountForm({ game: masked })

      expect(wrapper.get('[data-test="game-participants-locked"]').text()).toBe(
        'games.form.participantsLocked'
      )
      expect(wrapper.get('[data-test="game-add-participant"]').attributes('disabled')).toBeDefined()
      expect(
        wrapper.get('[data-test="game-participant-remove"]').attributes('disabled')
      ).toBeDefined()

      await submit(wrapper)

      expect(updateGameServiceMock).toHaveBeenCalledTimes(1)
      expect(updateGameServiceMock.mock.calls[0][2]).not.toHaveProperty('participants')
    })

    it('does not lock the players when their emails are visible', () => {
      const wrapper = mountForm({ game: editedGame })

      expect(wrapper.find('[data-test="game-participants-locked"]').exists()).toBe(false)
    })
  })
})
