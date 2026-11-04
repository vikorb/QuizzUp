import { roomsFixture } from '@frontend-tests/_helpers/gamesServiceMock'
import {
  GAME_DEFAULT_QUESTIONS_PER_ROUND,
  GAME_DEFAULT_ROUNDS,
  GAME_MAX_QUESTIONS_PER_ROUND,
  GAME_MAX_ROUNDS,
  GAME_PARTICIPANT_DISPLAY_NAME_MAX_LENGTH,
  GAME_PODIUMS,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import type { GameFormValues, GameParticipantFormValues } from '@/types/game'
import {
  buildCreateGamePayload,
  canAddGameParticipant,
  canRemoveGameParticipant,
  closeGameSecondPlayer,
  createDefaultGameFormValues,
  createGameParticipantFormValues,
  getActiveGameRooms,
  getGamePodiums,
  getNextFreePodium,
  hasGameFormErrors,
  isGameParticipantConsentMissing,
  isGameSecondPlayerConsentMissing,
  openGameSecondPlayer,
  validateGameForm,
} from '@/utils/game/form'

function participant(
  overrides: Partial<GameParticipantFormValues> = {}
): GameParticipantFormValues {
  return {
    ...createGameParticipantFormValues(1),
    displayName: 'Team A',
    ...overrides,
  }
}

function withSecondPlayer(
  overrides: Partial<GameParticipantFormValues> = {}
): GameParticipantFormValues {
  return participant({
    hasSecondPlayer: true,
    secondDisplayName: 'Alex',
    ...overrides,
  })
}

function validForm(overrides: Partial<GameFormValues> = {}): GameFormValues {
  return {
    ...createDefaultGameFormValues(),
    roomId: '10',
    participants: [participant()],
    ...overrides,
  }
}

describe('utils/game/form', () => {
  describe('createDefaultGameFormValues', () => {
    it('uses the shared default format and one participant on podium 1', () => {
      const form = createDefaultGameFormValues()

      expect(form.roomId).toBe('')
      expect(form.roundsCount).toBe(String(GAME_DEFAULT_ROUNDS))
      expect(form.questionsPerRound).toBe(String(GAME_DEFAULT_QUESTIONS_PER_ROUND))
      expect(form.participants).toHaveLength(1)
      expect(form.participants[0].podium).toBe('1')
    })

    it('never pre-ticks the GDPR consent', () => {
      expect(createDefaultGameFormValues().participants[0].emailConsent).toBe(false)
      expect(createGameParticipantFormValues(3).emailConsent).toBe(false)
    })

    it('gives each participant a unique key', () => {
      expect(createGameParticipantFormValues(1).key).not.toBe(
        createGameParticipantFormValues(1).key
      )
    })
  })

  describe('podiums', () => {
    it('lists podiums 1 to GAME_PODIUMS', () => {
      expect(getGamePodiums()).toEqual(
        Array.from({ length: GAME_PODIUMS }, (_item, index) => index + 1)
      )
    })

    it('returns the first free podium', () => {
      expect(getNextFreePodium([participant({ podium: '1' }), participant({ podium: '3' })])).toBe(
        2
      )
    })

    it('returns null when every podium is taken', () => {
      const full = getGamePodiums().map((podium) => participant({ podium: String(podium) }))

      expect(getNextFreePodium(full)).toBeNull()
      expect(canAddGameParticipant(full)).toBe(false)
    })

    it('allows adding while a podium is free and removing while more than one', () => {
      expect(canAddGameParticipant([participant()])).toBe(true)
      expect(canRemoveGameParticipant([participant()])).toBe(false)
      expect(canRemoveGameParticipant([participant(), participant({ podium: '2' })])).toBe(true)
    })
  })

  it('keeps only active rooms', () => {
    expect(getActiveGameRooms(roomsFixture).map((room) => room.id)).toEqual([10, 11])
  })

  describe('validateGameForm', () => {
    it('accepts a valid form', () => {
      expect(hasGameFormErrors(validateGameForm(validForm()))).toBe(false)
    })

    it('requires a room', () => {
      const errors = validateGameForm(validForm({ roomId: '' }))

      expect(errors.roomId).toBe('games.form.errors.roomRequired')
      expect(hasGameFormErrors(errors)).toBe(true)
    })

    it.each(['0', '-1', '1.5', 'abc', '', String(GAME_MAX_ROUNDS + 1)])(
      'rejects %s rounds',
      (roundsCount) => {
        expect(validateGameForm(validForm({ roundsCount })).roundsCount).toBe(
          'games.form.errors.roundsInvalid'
        )
      }
    )

    it('accepts the bounds of the format', () => {
      const errors = validateGameForm(
        validForm({
          roundsCount: String(GAME_MAX_ROUNDS),
          questionsPerRound: String(GAME_MAX_QUESTIONS_PER_ROUND),
        })
      )

      expect(errors.roundsCount).toBe('')
      expect(errors.questionsPerRound).toBe('')
    })

    it('rejects too many questions per round', () => {
      expect(
        validateGameForm(validForm({ questionsPerRound: String(GAME_MAX_QUESTIONS_PER_ROUND + 1) }))
          .questionsPerRound
      ).toBe('games.form.errors.questionsInvalid')
    })

    it('requires a display name and caps its length', () => {
      const errors = validateGameForm(
        validForm({
          participants: [
            participant({ displayName: '   ' }),
            participant({
              podium: '2',
              displayName: 'x'.repeat(GAME_PARTICIPANT_DISPLAY_NAME_MAX_LENGTH + 1),
            }),
          ],
        })
      )

      expect(errors.participants[0].displayName).toBe('games.form.errors.displayNameRequired')
      expect(errors.participants[1].displayName).toBe('games.form.errors.displayNameTooLong')
    })

    it('rejects an invalid email', () => {
      const errors = validateGameForm(
        validForm({ participants: [participant({ email: 'not-an-email', emailConsent: true })] })
      )

      expect(errors.participants[0].email).toBe('games.form.errors.emailInvalid')
    })

    it('rejects two participants on the same podium', () => {
      const errors = validateGameForm(
        validForm({
          participants: [participant({ podium: '2' }), participant({ podium: '2' })],
        })
      )

      expect(errors.participants[0].podium).toBe('games.form.errors.podiumDuplicated')
      expect(errors.participants[1].podium).toBe('games.form.errors.podiumDuplicated')
    })

    it('rejects a podium out of range', () => {
      const errors = validateGameForm(
        validForm({ participants: [participant({ podium: String(GAME_PODIUMS + 1) })] })
      )

      expect(errors.participants[0].podium).toBe('games.form.errors.podiumInvalid')
    })
  })

  describe('GDPR consent rule', () => {
    it('requires the consent when an email is entered', () => {
      const entered = participant({ email: 'player@quizzup.test', emailConsent: false })
      const errors = validateGameForm(validForm({ participants: [entered] }))

      expect(isGameParticipantConsentMissing(entered)).toBe(true)
      expect(errors.participants[0].emailConsent).toBe('games.form.errors.consentRequired')
      expect(hasGameFormErrors(errors)).toBe(true)
    })

    it('accepts an email with an explicit consent', () => {
      const entered = participant({ email: 'player@quizzup.test', emailConsent: true })

      expect(isGameParticipantConsentMissing(entered)).toBe(false)
      expect(hasGameFormErrors(validateGameForm(validForm({ participants: [entered] })))).toBe(
        false
      )
    })

    it('does not require the consent without an email', () => {
      const withoutEmail = participant({ email: '   ', emailConsent: false })

      expect(isGameParticipantConsentMissing(withoutEmail)).toBe(false)
      expect(validateGameForm(validForm({ participants: [withoutEmail] })).participants[0]).toEqual(
        {
          podium: '',
          displayName: '',
          email: '',
          emailConsent: '',
          secondDisplayName: '',
          secondEmail: '',
          secondEmailConsent: '',
        }
      )
    })
  })

  describe('buildCreateGamePayload', () => {
    it('trims values, converts numbers and sorts participants by podium', () => {
      const payload = buildCreateGamePayload(
        validForm({
          roundsCount: ' 5 ',
          questionsPerRound: '8',
          participants: [
            participant({ podium: '3', displayName: '  Team C  ' }),
            participant({
              podium: '1',
              displayName: 'Team A',
              email: ' a@quizzup.test ',
              emailConsent: true,
            }),
          ],
        })
      )

      expect(payload).toEqual({
        roomId: 10,
        roundsCount: 5,
        questionsPerRound: 8,
        participants: [
          { podium: 1, displayName: 'Team A', email: 'a@quizzup.test', emailConsent: true },
          { podium: 3, displayName: 'Team C' },
        ],
      })
    })

    it('sends neither email nor consent when no email is entered', () => {
      const payload = buildCreateGamePayload(
        validForm({ participants: [participant({ email: '', emailConsent: true })] })
      )

      expect(payload.participants[0]).toEqual({ podium: 1, displayName: 'Team A' })
    })
  })

  describe('second player', () => {
    it('starts closed with an unticked consent, and closing forgets the entry', () => {
      const entered = createGameParticipantFormValues(2)

      expect(entered.hasSecondPlayer).toBe(false)
      expect(entered.secondEmailConsent).toBe(false)

      openGameSecondPlayer(entered)
      expect(entered.hasSecondPlayer).toBe(true)

      Object.assign(entered, {
        secondDisplayName: 'Alex',
        secondEmail: 'alex@quizzup.test',
        secondEmailConsent: true,
      })
      closeGameSecondPlayer(entered)

      expect(entered).toMatchObject({
        hasSecondPlayer: false,
        secondDisplayName: '',
        secondEmail: '',
        secondEmailConsent: false,
      })
    })

    it('requires the name of the second player once the block is open', () => {
      const errors = validateGameForm(
        validForm({ participants: [withSecondPlayer({ secondDisplayName: '   ' })] })
      )

      expect(errors.participants[0].secondDisplayName).toBe('games.form.errors.displayNameRequired')
      expect(errors.participants[0].displayName).toBe('')
      expect(hasGameFormErrors(errors)).toBe(true)
    })

    it('rejects a too long name and an invalid email for the second player', () => {
      const errors = validateGameForm(
        validForm({
          participants: [
            withSecondPlayer({
              secondDisplayName: 'x'.repeat(GAME_PARTICIPANT_DISPLAY_NAME_MAX_LENGTH + 1),
              secondEmail: 'not-an-email',
              secondEmailConsent: true,
            }),
          ],
        })
      )

      expect(errors.participants[0].secondDisplayName).toBe('games.form.errors.displayNameTooLong')
      expect(errors.participants[0].secondEmail).toBe('games.form.errors.emailInvalid')
    })

    it('applies the GDPR consent rule to the second player on its own', () => {
      const entered = withSecondPlayer({ secondEmail: 'alex@quizzup.test' })
      const errors = validateGameForm(validForm({ participants: [entered] }))

      expect(isGameSecondPlayerConsentMissing(entered)).toBe(true)
      expect(isGameParticipantConsentMissing(entered)).toBe(false)
      expect(errors.participants[0].secondEmailConsent).toBe('games.form.errors.consentRequired')
      expect(errors.participants[0].emailConsent).toBe('')

      const consented = withSecondPlayer({
        secondEmail: 'alex@quizzup.test',
        secondEmailConsent: true,
      })

      expect(isGameSecondPlayerConsentMissing(consented)).toBe(false)
      expect(hasGameFormErrors(validateGameForm(validForm({ participants: [consented] })))).toBe(
        false
      )
    })

    it('ignores the second player fields while the block is closed', () => {
      const closed = participant({
        hasSecondPlayer: false,
        secondDisplayName: '',
        secondEmail: 'alex@quizzup.test',
        secondEmailConsent: false,
      })

      expect(isGameSecondPlayerConsentMissing(closed)).toBe(false)
      expect(hasGameFormErrors(validateGameForm(validForm({ participants: [closed] })))).toBe(false)
      expect(buildCreateGamePayload(validForm({ participants: [closed] })).participants[0]).toEqual(
        { podium: 1, displayName: 'Team A' }
      )
    })

    it('sends the second player of a podium, trimmed, with its own email and consent', () => {
      const payload = buildCreateGamePayload(
        validForm({
          participants: [
            withSecondPlayer({
              secondDisplayName: '  Alex  ',
              secondEmail: ' alex@quizzup.test ',
              secondEmailConsent: true,
            }),
          ],
        })
      )

      expect(payload.participants).toEqual([
        {
          podium: 1,
          displayName: 'Team A',
          secondPlayer: {
            displayName: 'Alex',
            email: 'alex@quizzup.test',
            emailConsent: true,
          },
        },
      ])
    })

    it('sends a second player without email nor consent when none is entered', () => {
      const payload = buildCreateGamePayload(
        validForm({ participants: [withSecondPlayer({ secondEmailConsent: true })] })
      )

      expect(payload.participants[0].secondPlayer).toEqual({ displayName: 'Alex' })
    })
  })
})
