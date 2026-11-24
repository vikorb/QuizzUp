import {
  createParticipantFixture,
  createScheduledGameFixture,
  createScheduleFixture,
  roomsFixture,
} from '@frontend-tests/_helpers/gamesServiceMock'
import { GAME_EXTERNAL_REF_MAX_LENGTH, MINI_GAME_FIRST_BUZZ, MINI_GAMES } from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import type { GameFormValues, GameRoom } from '@/types/game'
import {
  applyGamePrefill,
  buildCreateGamePayload,
  buildUpdateGamePayload,
  canRemoveGameParticipant,
  createDefaultGameFormValues,
  createGameFormValuesFromGame,
  createGameParticipantFormValues,
  getGameRoomTimeZone,
  hasGameFormErrors,
  hasMaskedParticipantEmails,
  parseGamePrefill,
  setGameScheduled,
  validateGameForm,
} from '@/utils/game/form'

const PARIS_ROOM: GameRoom = { ...roomsFixture[0], schedule: createScheduleFixture() }
const LONDON_ROOM: GameRoom = {
  ...roomsFixture[1],
  schedule: createScheduleFixture(undefined, 'Europe/London'),
}

function scheduledForm(overrides: Partial<GameFormValues> = {}): GameFormValues {
  return {
    ...createDefaultGameFormValues(),
    roomId: '10',
    scheduled: true,
    scheduledDate: '2026-12-05',
    scheduledTime: '14:00',
    participants: [],
    ...overrides,
  }
}

describe('the instant of the day and time typed', () => {
  it('is read in the time zone of the room', () => {
    expect(buildCreateGamePayload(scheduledForm(), 'Europe/Paris').scheduledAt).toBe(
      '2026-12-05T13:00:00.000Z'
    )
    expect(buildCreateGamePayload(scheduledForm(), 'Europe/London').scheduledAt).toBe(
      '2026-12-05T14:00:00.000Z'
    )
  })

  it.each([
    ['no day', { scheduledDate: '' }, 'scheduledAtRequired'],
    ['no time', { scheduledTime: '' }, 'scheduledAtRequired'],
    ['a time out of range', { scheduledTime: '25:00' }, 'scheduledAtInvalid'],
    ['a day the calendar refuses', { scheduledDate: '2026-02-30' }, 'scheduledAtInvalid'],
    // 02:30 n'existe pas le 28 mars 2027 à Paris (passage à l'heure d'été).
    [
      'a time skipped by the clock change',
      { scheduledDate: '2027-03-28', scheduledTime: '02:30' },
      'scheduledAtInvalid',
    ],
  ])('is refused with %s', (_label, overrides, code) => {
    const errors = validateGameForm(scheduledForm(overrides), 4, 'Europe/Paris')

    expect(errors.scheduledAt).toBe(`games.form.errors.${code}`)
  })
})

describe('getGameRoomTimeZone', () => {
  it('is the time zone of the room, the default one without slots or without room', () => {
    expect(getGameRoomTimeZone([LONDON_ROOM], '11')).toBe('Europe/London')
    expect(getGameRoomTimeZone([roomsFixture[0]], '10')).toBe('Europe/Paris')
    expect(getGameRoomTimeZone([LONDON_ROOM], '')).toBe('Europe/Paris')
  })
})

describe('setGameScheduled', () => {
  it('drops the blank starting participant when scheduling, since players are optional', () => {
    const form = createDefaultGameFormValues()

    setGameScheduled(form, true)

    expect(form.scheduled).toBe(true)
    expect(form.participants).toEqual([])
  })

  it('keeps a participant the operator has filled in', () => {
    const form = createDefaultGameFormValues()
    form.participants[0].displayName = 'Les Quizzeurs'

    setGameScheduled(form, true)

    expect(form.participants).toHaveLength(1)
  })

  it('puts one participant back when the session becomes immediate again', () => {
    const form = scheduledForm()

    setGameScheduled(form, false)

    expect(form.scheduled).toBe(false)
    expect(form.participants).toHaveLength(1)
    expect(form.participants[0].podium).toBe('1')
  })
})

describe('canRemoveGameParticipant', () => {
  it('lets a scheduled session have no participant, never an immediate game', () => {
    const one = [createGameParticipantFormValues(1)]

    expect(canRemoveGameParticipant(one)).toBe(false)
    expect(canRemoveGameParticipant(one, true)).toBe(true)
    expect(canRemoveGameParticipant([], true)).toBe(false)
  })
})

describe('validateGameForm of a scheduled session', () => {
  it('accepts a session with no participant', () => {
    expect(hasGameFormErrors(validateGameForm(scheduledForm(), 4, 'Europe/Paris'))).toBe(false)
  })

  it('asks for the day and the time', () => {
    const errors = validateGameForm(scheduledForm({ scheduledTime: '' }), 4, 'Europe/Paris')

    expect(errors.scheduledAt).toBe('games.form.errors.scheduledAtRequired')
  })

  it('refuses a time that does not exist in the time zone of the room', () => {
    const errors = validateGameForm(
      scheduledForm({ scheduledDate: '2027-03-28', scheduledTime: '02:30' }),
      4,
      'Europe/Paris'
    )

    expect(errors.scheduledAt).toBe('games.form.errors.scheduledAtInvalid')
  })

  it.each(['9', '241', 'abc', '60.5'])('refuses the duration %s', (durationMinutes) => {
    const errors = validateGameForm(scheduledForm({ durationMinutes }), 4, 'Europe/Paris')

    expect(errors.durationMinutes).toBe('games.form.errors.durationInvalid')
  })

  it.each(['0', '13', 'abc'])('refuses the headcount %s', (playersCount) => {
    const errors = validateGameForm(scheduledForm({ playersCount }), 4, 'Europe/Paris')

    expect(errors.playersCount).toBe('games.form.errors.playersCountInvalid')
  })

  it('refuses a booking reference that is too long, and accepts the longest one', () => {
    const tooLong = 'x'.repeat(GAME_EXTERNAL_REF_MAX_LENGTH + 1)
    const longest = 'x'.repeat(GAME_EXTERNAL_REF_MAX_LENGTH)

    expect(
      validateGameForm(scheduledForm({ externalRef: tooLong }), 4, 'Europe/Paris')
    ).toMatchObject({ externalRef: 'games.form.errors.externalRefTooLong' })
    expect(
      hasGameFormErrors(
        validateGameForm(scheduledForm({ externalRef: ` ${longest} ` }), 4, 'Europe/Paris')
      )
    ).toBe(false)
  })

  it('accepts the bounds of the duration and of the headcount', () => {
    for (const overrides of [
      { durationMinutes: '10', playersCount: '12' },
      { durationMinutes: '240', playersCount: '1' },
    ]) {
      expect(hasGameFormErrors(validateGameForm(scheduledForm(overrides), 4, 'Europe/Paris'))).toBe(
        false
      )
    }
  })

  it('does not look at the schedule fields of an immediate game', () => {
    const form = { ...createDefaultGameFormValues(), roomId: '10', scheduledDate: 'nope' }
    form.participants[0].displayName = 'Les Quizzeurs'

    expect(hasGameFormErrors(validateGameForm(form, 4))).toBe(false)
  })
})

describe('buildCreateGamePayload of a scheduled session', () => {
  it('sends the instant in UTC, the duration and the headcount', () => {
    const payload = buildCreateGamePayload(
      scheduledForm({ durationMinutes: ' 90 ', playersCount: '6' }),
      'Europe/Paris'
    )

    expect(payload).toMatchObject({
      roomId: 10,
      scheduledAt: '2026-12-05T13:00:00.000Z',
      durationMinutes: 90,
      playersCount: 6,
      participants: [],
    })
  })

  it('leaves out the duration, the headcount and the reference when they are empty', () => {
    const payload = buildCreateGamePayload(scheduledForm({ externalRef: '  ' }), 'Europe/Paris')

    expect(payload.scheduledAt).toBe('2026-12-05T13:00:00.000Z')
    expect(payload).not.toHaveProperty('durationMinutes')
    expect(payload).not.toHaveProperty('playersCount')
    expect(payload).not.toHaveProperty('externalRef')
  })

  it('sends the booking reference, trimmed', () => {
    const payload = buildCreateGamePayload(
      scheduledForm({ externalRef: ' BK-42 ' }),
      'Europe/Paris'
    )

    expect(payload.externalRef).toBe('BK-42')
  })

  it('keeps the instant of the link while the day and time shown are those of the link', () => {
    // 01:30Z le 25 octobre 2026 : 02:30 à Paris, au second passage de l'heure (la première est 00:30Z).
    const form = scheduledForm({ scheduledDate: '2026-10-25', scheduledTime: '02:30' })

    expect(buildCreateGamePayload(form, 'Europe/Paris').scheduledAt).toBe(
      '2026-10-25T00:30:00.000Z'
    )
    expect(
      buildCreateGamePayload(form, 'Europe/Paris', '2026-10-25T01:30:00.000Z').scheduledAt
    ).toBe('2026-10-25T01:30:00.000Z')
  })

  it('reads the typed time again once it is not the one of the link', () => {
    const form = scheduledForm({ scheduledDate: '2026-10-25', scheduledTime: '03:00' })

    expect(
      buildCreateGamePayload(form, 'Europe/Paris', '2026-10-25T01:30:00.000Z').scheduledAt
    ).toBe('2026-10-25T02:00:00.000Z')
  })

  it('drops the seconds of the instant of the link', () => {
    const form = scheduledForm({ scheduledDate: '2026-10-25', scheduledTime: '02:30' })

    expect(
      buildCreateGamePayload(form, 'Europe/Paris', '2026-10-25T01:30:42.000Z').scheduledAt
    ).toBe('2026-10-25T01:30:00.000Z')
  })

  it('keeps the body of an immediate game, whatever the hidden schedule fields hold', () => {
    const form = {
      ...createDefaultGameFormValues(),
      roomId: '10',
      scheduledDate: '2026-12-05',
      scheduledTime: '14:00',
      durationMinutes: '90',
      playersCount: '6',
    }
    form.participants[0].displayName = 'Les Quizzeurs'

    expect(Object.keys(buildCreateGamePayload(form))).toEqual([
      'roomId',
      'roundsCount',
      'questionsPerRound',
      'participants',
    ])
  })
})

describe('parseGamePrefill', () => {
  it('reads a room and an instant', () => {
    expect(parseGamePrefill({ roomId: '10', scheduledAt: '2026-12-05T13:00:00.000Z' })).toEqual({
      roomId: 10,
      scheduledAt: '2026-12-05T13:00:00.000Z',
    })
    expect(parseGamePrefill({ scheduledAt: '2026-12-05T14:00:00+01:00' })).toEqual({
      scheduledAt: '2026-12-05T14:00:00+01:00',
    })
  })

  it('takes the first value of a repeated parameter', () => {
    expect(parseGamePrefill({ roomId: ['11', '12'] })).toEqual({ roomId: 11 })
  })

  it.each([
    ['a room that is not a number', { roomId: 'abc' }],
    ['a room that is zero', { roomId: '0' }],
    ['a negative room', { roomId: '-3' }],
    ['an instant that is not a date', { scheduledAt: 'demain' }],
    ['a day without a time', { scheduledAt: '2026-12-05' }],
    ['an instant without a time zone', { scheduledAt: '2026-12-05T14:00' }],
    ['an instant that does not exist', { scheduledAt: '2026-13-45T14:00:00Z' }],
    ['empty values', { roomId: '', scheduledAt: '' }],
    ['values that are not text', { roomId: {}, scheduledAt: 12 }],
  ])('ignores %s', (_label, query) => {
    expect(parseGamePrefill(query)).toEqual({})
  })
})

describe('applyGamePrefill', () => {
  it('chooses the room and fills the day and time in the time zone of that room', () => {
    const form = createDefaultGameFormValues()

    applyGamePrefill(form, [PARIS_ROOM, LONDON_ROOM], {
      roomId: 11,
      scheduledAt: '2026-12-05T14:00:00.000Z',
    })

    expect(form).toMatchObject({
      roomId: '11',
      scheduled: true,
      scheduledDate: '2026-12-05',
      scheduledTime: '14:00',
      participants: [],
    })
  })

  it('shows the time of a room in Paris at the time of Paris', () => {
    const form = createDefaultGameFormValues()

    applyGamePrefill(form, [PARIS_ROOM], { roomId: 10, scheduledAt: '2026-12-05T13:00:00.000Z' })

    expect(form.scheduledTime).toBe('14:00')
  })

  it('ignores an inactive or unknown room, and then the time, which has no zone', () => {
    const form = createDefaultGameFormValues()

    applyGamePrefill(form, roomsFixture, { roomId: 12, scheduledAt: '2026-12-05T14:00:00.000Z' })
    applyGamePrefill(form, roomsFixture, { roomId: 99 })

    expect(form).toMatchObject({ roomId: '', scheduled: false, scheduledDate: '' })
    expect(form.participants).toHaveLength(1)
  })

  it('reads the time in the zone of the room already chosen when the link has no room', () => {
    const form = { ...createDefaultGameFormValues(), roomId: '11' }

    applyGamePrefill(form, [PARIS_ROOM, LONDON_ROOM], { scheduledAt: '2026-12-05T14:00:00.000Z' })

    expect(form).toMatchObject({ roomId: '11', scheduled: true, scheduledTime: '14:00' })
  })
})

describe('editing a scheduled session', () => {
  const game = createScheduledGameFixture('2026-12-05T13:00:00.000Z', {
    id: 5,
    roomId: 10,
    roundsCount: 8,
    questionsPerRound: 6,
    playersCount: 7,
    participants: [
      createParticipantFixture({
        id: 2,
        podium: 2,
        displayName: 'Team B',
        email: 'b@quizzup.test',
        hasEmail: true,
        consentAt: '2026-11-03T10:00:00.000Z',
        marketingConsent: true,
        secondPlayer: {
          displayName: 'Alex',
          email: null,
          hasEmail: false,
          consentAt: null,
          marketingConsent: false,
        },
      }),
      createParticipantFixture({ id: 1, podium: 1, displayName: 'Team A' }),
    ],
  })
  const withParticipants = { includeParticipants: true }

  function editedForm() {
    return createGameFormValuesFromGame(game, 'Europe/Paris')
  }

  it('fills the form from the session, in the time zone of its room', () => {
    const form = createGameFormValuesFromGame(game, 'Europe/Paris')

    expect(form).toMatchObject({
      roomId: '10',
      roundsCount: '8',
      questionsPerRound: '6',
      scheduled: true,
      scheduledDate: '2026-12-05',
      scheduledTime: '14:00',
      durationMinutes: '60',
      playersCount: '7',
    })
    expect(form.miniGames).toEqual([...MINI_GAMES])
    expect(form.participants.map(({ podium, displayName }) => [podium, displayName])).toEqual([
      ['1', 'Team A'],
      ['2', 'Team B'],
    ])
  })

  it('keeps the consent already given with an email, and the second player', () => {
    const [, teamB] = createGameFormValuesFromGame(game, 'Europe/Paris').participants

    expect(teamB).toMatchObject({
      email: 'b@quizzup.test',
      emailConsent: true,
      marketingConsent: true,
      hasSecondPlayer: true,
      secondDisplayName: 'Alex',
      secondEmail: '',
      secondEmailConsent: false,
    })
  })

  it('restores the chosen mini-games and an empty headcount', () => {
    const form = createGameFormValuesFromGame(
      { ...game, miniGames: [MINI_GAME_FIRST_BUZZ], playersCount: null },
      'Europe/Paris'
    )

    expect(form.miniGames).toEqual([MINI_GAME_FIRST_BUZZ])
    expect(form.playersCount).toBe('')
  })

  it('detects masked emails, of the first or of the second player', () => {
    const masked = createParticipantFixture({ email: null, hasEmail: true })
    const secondMasked = createParticipantFixture({
      secondPlayer: {
        displayName: 'Alex',
        email: null,
        hasEmail: true,
        consentAt: null,
        marketingConsent: false,
      },
    })

    expect(hasMaskedParticipantEmails(game)).toBe(false)
    expect(hasMaskedParticipantEmails({ ...game, participants: [masked] })).toBe(true)
    expect(hasMaskedParticipantEmails({ ...game, participants: [secondMasked] })).toBe(true)
    expect(hasMaskedParticipantEmails({ ...game, participants: undefined })).toBe(false)
  })

  describe('buildUpdateGamePayload', () => {
    it('sends nothing the server controls when nothing moved', () => {
      const payload = buildUpdateGamePayload(editedForm(), 'Europe/Paris', game, withParticipants)

      expect(payload).toEqual({ roomId: 10, playersCount: 7 })
    })

    it('sends the new start, duration and format when they changed', () => {
      const form = editedForm()
      Object.assign(form, {
        scheduledTime: '15:30',
        durationMinutes: '90',
        roundsCount: '5',
        questionsPerRound: '4',
      })

      expect(buildUpdateGamePayload(form, 'Europe/Paris', game, withParticipants)).toMatchObject({
        scheduledAt: '2026-12-05T14:30:00.000Z',
        durationMinutes: 90,
        roundsCount: 5,
        questionsPerRound: 4,
      })
    })

    it('clears the headcount with null and writes only the chosen mini-games', () => {
      const form = editedForm()
      form.playersCount = ''
      form.miniGames = [MINI_GAME_FIRST_BUZZ]

      expect(buildUpdateGamePayload(form, 'Europe/Paris', game, withParticipants)).toMatchObject({
        playersCount: null,
        miniGames: [MINI_GAME_FIRST_BUZZ],
      })
    })

    it('writes all the mini-games as the full list, never null, once all are ticked again', () => {
      const restricted = { ...game, miniGames: [MINI_GAME_FIRST_BUZZ] }
      const form = createGameFormValuesFromGame(restricted, 'Europe/Paris')
      form.miniGames = [...MINI_GAMES].reverse()

      const payload = buildUpdateGamePayload(form, 'Europe/Paris', restricted, withParticipants)

      expect(payload.miniGames).toEqual([...MINI_GAMES])
    })

    it('leaves the mini-games out when the selection is the one loaded', () => {
      const restricted = { ...game, miniGames: [MINI_GAME_FIRST_BUZZ] }
      const form = createGameFormValuesFromGame(restricted, 'Europe/Paris')

      expect(
        buildUpdateGamePayload(form, 'Europe/Paris', restricted, withParticipants)
      ).not.toHaveProperty('miniGames')
    })

    it('sends the participants by podium once they changed, none when they did not', () => {
      const form = editedForm()
      form.participants[0].displayName = 'Team A bis'

      const payload = buildUpdateGamePayload(form, 'Europe/Paris', game, withParticipants)

      expect(payload.participants?.map((item) => [item.podium, item.displayName])).toEqual([
        [1, 'Team A bis'],
        [2, 'Team B'],
      ])
      expect(
        buildUpdateGamePayload(editedForm(), 'Europe/Paris', game, withParticipants)
      ).not.toHaveProperty('participants')
    })

    it('sends the participants when one is added or removed', () => {
      const added = editedForm()
      added.participants.push(createGameParticipantFormValues(3))
      added.participants[2].displayName = 'Team C'
      const removed = editedForm()
      removed.participants.pop()

      expect(
        buildUpdateGamePayload(added, 'Europe/Paris', game, withParticipants).participants
      ).toHaveLength(3)
      expect(
        buildUpdateGamePayload(removed, 'Europe/Paris', game, withParticipants).participants
      ).toHaveLength(1)
    })

    it('never sends the participants when they are locked', () => {
      const form = editedForm()
      form.participants[0].displayName = 'Team A bis'

      expect(
        buildUpdateGamePayload(form, 'Europe/Paris', game, { includeParticipants: false })
      ).not.toHaveProperty('participants')
    })

    it('sends the booking reference only when it changed, and null to clear it', () => {
      const withRef = { ...game, externalRef: 'BK-1' }
      const form = createGameFormValuesFromGame(withRef, 'Europe/Paris')

      expect(form.externalRef).toBe('BK-1')
      expect(
        buildUpdateGamePayload(form, 'Europe/Paris', withRef, withParticipants)
      ).not.toHaveProperty('externalRef')

      form.externalRef = ' BK-2 '
      expect(
        buildUpdateGamePayload(form, 'Europe/Paris', withRef, withParticipants).externalRef
      ).toBe('BK-2')

      form.externalRef = ' '
      expect(
        buildUpdateGamePayload(form, 'Europe/Paris', withRef, withParticipants).externalRef
      ).toBeNull()
    })

    it('does not send an empty booking reference of a session that had none', () => {
      expect(
        buildUpdateGamePayload(editedForm(), 'Europe/Paris', game, withParticipants)
      ).not.toHaveProperty('externalRef')
    })

    describe('at the repeated hour of the autumn clock change', () => {
      // 01:30Z le 25 octobre 2026 : 02:30 à Paris, second passage (le premier est 00:30Z).
      const repeated = createScheduledGameFixture('2026-10-25T01:30:00.000Z', {
        id: 6,
        roomId: 10,
        participants: [],
      })

      it('shows the session at 02:30 and sends no start when another field changes', () => {
        const form = createGameFormValuesFromGame(repeated, 'Europe/Paris')

        expect(form).toMatchObject({ scheduledDate: '2026-10-25', scheduledTime: '02:30' })

        form.playersCount = '5'

        const payload = buildUpdateGamePayload(form, 'Europe/Paris', repeated, withParticipants)

        expect(payload).not.toHaveProperty('scheduledAt')
        expect(payload.playersCount).toBe(5)
      })

      it('reads a different time again, and the first passage once the time is typed again', () => {
        const form = createGameFormValuesFromGame(repeated, 'Europe/Paris')

        form.scheduledTime = '03:00'
        expect(
          buildUpdateGamePayload(form, 'Europe/Paris', repeated, withParticipants).scheduledAt
        ).toBe('2026-10-25T02:00:00.000Z')

        // Retaper 02:30 après une autre heure : c'est l'instant d'origine qui revient.
        form.scheduledTime = '02:30'
        expect(
          buildUpdateGamePayload(form, 'Europe/Paris', repeated, withParticipants)
        ).not.toHaveProperty('scheduledAt')
      })

      it('reads the typed time in the new room when the room changes', () => {
        const form = createGameFormValuesFromGame(repeated, 'Europe/Paris')

        // Londres : le même texte (02:30) est lu en heure de Londres (UTC+0 ce jour-là).
        expect(
          buildUpdateGamePayload(form, 'Europe/London', repeated, withParticipants).scheduledAt
        ).toBe('2026-10-25T02:30:00.000Z')
      })
    })
  })
})
