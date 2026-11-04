import {
  createGameServiceMock,
  mockServiceFailure,
  resetGamesServiceMock,
  roomsFixture,
} from '@frontend-tests/_helpers/gamesServiceMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import {
  GAME_PODIUMS,
  MINI_GAME_FIRST_BUZZ,
  MINI_GAME_FLASH_BLIND_TEST,
  MINI_GAME_QUICK_ANSWER,
  MINI_GAMES,
  ROOM_STATUS_ACTIVE,
  ROOM_STATUS_INACTIVE,
} from '@quizzup/shared'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { GameRoom } from '@/types/game'
import CreateGameForm from '@/views/games/creation/CreateGameForm.vue'

vi.mock('@/services/gamesService', async () => {
  const gamesService = await import('@frontend-tests/_helpers/gamesServiceMock')

  return gamesService.gamesServiceModuleMock
})

resetFrontendMocksBeforeEach()

beforeEach(() => {
  resetGamesServiceMock()
})

function mountForm(rooms: GameRoom[] = roomsFixture, roomsLoading = false): VueWrapper {
  return mountWithFrontendMocks(CreateGameForm, {
    props: {
      companyId: 1,
      rooms,
      roomsLoading,
    },
  })
}

function participants(wrapper: VueWrapper) {
  return wrapper.findAll('fieldset.participant')
}

function roomSelect(wrapper: VueWrapper) {
  return wrapper.findAll('[data-test="select-field"]')[0]
}

async function fillParticipant(
  wrapper: VueWrapper,
  index: number,
  values: { displayName?: string; email?: string }
): Promise<void> {
  if (values.displayName !== undefined) {
    await wrapper
      .get(`input[name="participants.${index}.displayName"]`)
      .setValue(values.displayName)
  }

  if (values.email !== undefined) {
    await wrapper.get(`input[name="participants.${index}.email"]`).setValue(values.email)
  }
}

type CreateResult = Awaited<ReturnType<typeof createGameServiceMock>>

/** Promesse résolue à la main, pour observer le formulaire pendant l'appel à l'API. */
function createDeferred(): {
  promise: Promise<CreateResult>
  resolve: (value: CreateResult) => void
} {
  let resolve!: (value: CreateResult) => void
  const promise = new Promise<CreateResult>((done) => {
    resolve = done
  })

  return { promise, resolve }
}

function miniGameBox(wrapper: VueWrapper, miniGame: string) {
  return wrapper.get<HTMLInputElement>(`[data-test="game-mini-game-${miniGame}"]`)
}

function podiumValues(wrapper: VueWrapper): string[] {
  return participants(wrapper).map(
    (participant) => participant.get<HTMLSelectElement>('select').element.value
  )
}

function podiumOptionValues(wrapper: VueWrapper, index = 0): string[] {
  return participants(wrapper)
    [index].get('select')
    .findAll('option')
    .map((option) => option.attributes('value') ?? '')
}

async function addParticipants(wrapper: VueWrapper, count: number): Promise<void> {
  for (let added = 0; added < count; added += 1) {
    await wrapper.get('[data-test="game-add-participant"]').trigger('click')
  }
}

async function submit(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('views/games/creation/CreateGameForm.vue', () => {
  it('starts with one participant, the default format and only active rooms', () => {
    const wrapper = mountForm()

    expect(participants(wrapper)).toHaveLength(1)
    expect(wrapper.get<HTMLInputElement>('input[name="roundsCount"]').element.value).toBe('10')
    expect(wrapper.get<HTMLInputElement>('input[name="questionsPerRound"]').element.value).toBe(
      '10'
    )
    expect(
      roomSelect(wrapper)
        .findAll('option')
        .map((option) => option.text())
    ).toEqual(['Salle Néon', 'Salle Laser'])
  })

  describe('mini-jeux', () => {
    it('shows one ticked box per mini-game, with the help text', () => {
      const wrapper = mountForm()

      for (const miniGame of MINI_GAMES) {
        expect(miniGameBox(wrapper, miniGame).element.checked).toBe(true)
        expect(wrapper.text()).toContain(`games.miniGames.${miniGame}`)
      }

      expect(wrapper.findAll('input[name="miniGames"]')).toHaveLength(MINI_GAMES.length)
      expect(wrapper.text()).toContain('games.form.sections.miniGames')
      expect(wrapper.text()).toContain('games.form.miniGamesHint')
      expect(wrapper.find('[data-test="game-mini-games-error"]').exists()).toBe(false)
    })

    it('links every box to the help text, then to the error', async () => {
      const wrapper = mountForm()
      const describedBy = () =>
        MINI_GAMES.map((miniGame) => miniGameBox(wrapper, miniGame).attributes('aria-describedby'))

      expect(describedBy()).toEqual(MINI_GAMES.map(() => 'game-mini-games_hint'))
      expect(wrapper.get('#game-mini-games_hint').text()).toContain('games.form.miniGamesHint')

      for (const miniGame of MINI_GAMES) {
        await miniGameBox(wrapper, miniGame).setValue(false)
      }
      await submit(wrapper)

      expect(describedBy()).toEqual(MINI_GAMES.map(() => 'game-mini-games_error'))
      expect(wrapper.get('#game-mini-games_error').text()).toBe(
        'games.form.errors.miniGamesRequired'
      )
      expect(wrapper.get('fieldset.mini-games').attributes('aria-describedby')).toBe(
        'game-mini-games_error'
      )
    })

    it('does not send miniGames while every mini-game stays ticked', async () => {
      const wrapper = mountForm()

      await roomSelect(wrapper).get('select').setValue('10')
      await fillParticipant(wrapper, 0, { displayName: 'Team A' })
      await submit(wrapper)

      expect(createGameServiceMock).toHaveBeenCalledTimes(1)
      expect(createGameServiceMock.mock.calls[0]?.[1]).not.toHaveProperty('miniGames')
    })

    it('sends the ticked subset in the shared order', async () => {
      const wrapper = mountForm()

      await roomSelect(wrapper).get('select').setValue('10')
      await fillParticipant(wrapper, 0, { displayName: 'Team A' })
      for (const miniGame of MINI_GAMES) {
        if (miniGame !== MINI_GAME_FIRST_BUZZ && miniGame !== MINI_GAME_FLASH_BLIND_TEST) {
          await miniGameBox(wrapper, miniGame).setValue(false)
        }
      }
      await submit(wrapper)

      expect(createGameServiceMock).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ miniGames: [MINI_GAME_FLASH_BLIND_TEST, MINI_GAME_FIRST_BUZZ] })
      )
    })

    it('sends the original order after unticking then re-ticking a box', async () => {
      const wrapper = mountForm()

      await roomSelect(wrapper).get('select').setValue('10')
      await fillParticipant(wrapper, 0, { displayName: 'Team A' })
      await miniGameBox(wrapper, MINI_GAME_FLASH_BLIND_TEST).setValue(false)
      await miniGameBox(wrapper, MINI_GAME_QUICK_ANSWER).setValue(false)
      await miniGameBox(wrapper, MINI_GAME_FLASH_BLIND_TEST).setValue(true)
      await submit(wrapper)

      expect(createGameServiceMock.mock.calls[0]?.[1]).toMatchObject({
        miniGames: MINI_GAMES.filter((miniGame) => miniGame !== MINI_GAME_QUICK_ANSWER),
      })
    })

    it('blocks the submission when no mini-game is ticked, then clears the error', async () => {
      const wrapper = mountForm()

      await roomSelect(wrapper).get('select').setValue('10')
      await fillParticipant(wrapper, 0, { displayName: 'Team A' })
      for (const miniGame of MINI_GAMES) {
        await miniGameBox(wrapper, miniGame).setValue(false)
      }
      await submit(wrapper)

      expect(createGameServiceMock).not.toHaveBeenCalled()
      expect(wrapper.get('[data-test="game-mini-games-error"]').text()).toBe(
        'games.form.errors.miniGamesRequired'
      )
      expect(wrapper.text()).not.toContain('games.form.miniGamesHint')

      await miniGameBox(wrapper, MINI_GAME_QUICK_ANSWER).setValue(true)

      expect(wrapper.find('[data-test="game-mini-games-error"]').exists()).toBe(false)

      await submit(wrapper)

      expect(createGameServiceMock).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ miniGames: [MINI_GAME_QUICK_ANSWER] })
      )
    })

    it('disables the boxes while the rooms are loading', () => {
      const wrapper = mountForm([], true)

      for (const miniGame of MINI_GAMES) {
        expect(miniGameBox(wrapper, miniGame).element.disabled).toBe(true)
      }
    })

    it('disables the boxes while the game is being created', async () => {
      const pending = createDeferred()
      createGameServiceMock.mockReturnValueOnce(pending.promise)
      const wrapper = mountForm()

      await roomSelect(wrapper).get('select').setValue('10')
      await fillParticipant(wrapper, 0, { displayName: 'Team A' })
      await wrapper.get('form').trigger('submit')
      await flushPromises()

      expect(miniGameBox(wrapper, MINI_GAME_FIRST_BUZZ).element.disabled).toBe(true)

      pending.resolve({ ok: false, status: 500, error: 'server_error' })
      await flushPromises()

      expect(miniGameBox(wrapper, MINI_GAME_FIRST_BUZZ).element.disabled).toBe(false)
    })
  })

  it('leaves the GDPR consent unticked and shows its purpose', () => {
    const wrapper = mountForm()
    const consent = wrapper.get<HTMLInputElement>('[data-test="game-participant-consent"]')

    expect(consent.element.checked).toBe(false)
    expect(wrapper.text()).toContain('games.form.consent')
  })

  it('adds participants up to the 6 podiums of a 6-podium room, then removes them', async () => {
    const wrapper = mountForm()
    await roomSelect(wrapper).get('select').setValue('11')
    const addButton = wrapper.get('[data-test="game-add-participant"]')

    expect(
      participants(wrapper)[0].get('[data-test="game-participant-remove"]').attributes('disabled')
    ).toBeDefined()

    for (let count = 1; count < GAME_PODIUMS; count += 1) {
      await addButton.trigger('click')
    }

    expect(participants(wrapper)).toHaveLength(GAME_PODIUMS)
    expect(addButton.attributes('disabled')).toBeDefined()

    await participants(wrapper)[1].get('[data-test="game-participant-remove"]').trigger('click')

    expect(participants(wrapper)).toHaveLength(GAME_PODIUMS - 1)
    expect(addButton.attributes('disabled')).toBeUndefined()
  })

  describe('pupitres de la salle choisie', () => {
    it('proposes 4 podiums while no room is chosen (default room)', () => {
      const wrapper = mountForm()

      expect(podiumOptionValues(wrapper)).toEqual(['1', '2', '3', '4'])
    })

    it('proposes only the podiums of the chosen room', async () => {
      const wrapper = mountForm([
        { id: 20, name: 'Petite', status: ROOM_STATUS_ACTIVE, desksCount: 2 },
        { id: 21, name: 'Grande', status: ROOM_STATUS_ACTIVE, desksCount: 6 },
        { id: 22, name: 'Ancienne', status: ROOM_STATUS_ACTIVE },
      ])
      const select = roomSelect(wrapper).get('select')

      await select.setValue('20')
      expect(podiumOptionValues(wrapper)).toEqual(['1', '2'])
      expect(wrapper.text()).toContain('games.form.participantsHint')

      await select.setValue('21')
      expect(podiumOptionValues(wrapper)).toEqual(['1', '2', '3', '4', '5', '6'])

      // Une réponse sans nombre (ancienne API) : 4 pupitres.
      await select.setValue('22')
      expect(podiumOptionValues(wrapper)).toEqual(['1', '2', '3', '4'])
    })

    it('stops adding participants at the number of podiums of a small room', async () => {
      const wrapper = mountForm([
        { id: 20, name: 'Petite', status: ROOM_STATUS_ACTIVE, desksCount: 2 },
        { id: 21, name: 'Autre', status: ROOM_STATUS_ACTIVE, desksCount: 6 },
      ])
      await roomSelect(wrapper).get('select').setValue('20')
      await addParticipants(wrapper, 5)

      expect(participants(wrapper)).toHaveLength(2)
      expect(wrapper.get('[data-test="game-add-participant"]').attributes('disabled')).toBeDefined()
    })

    it('moves a participant to a free podium when the room changes to a smaller one', async () => {
      const wrapper = mountForm()
      const select = roomSelect(wrapper).get('select')
      await select.setValue('11')
      await addParticipants(wrapper, 5)
      expect(podiumValues(wrapper)).toEqual(['1', '2', '3', '4', '5', '6'])

      await fillParticipant(wrapper, 4, { displayName: 'Cinq' })
      await select.setValue('10')

      // 4 pupitres : 5 et 6 ne sont plus possibles, et il ne reste aucun pupitre libre.
      expect(podiumValues(wrapper)).toEqual(['1', '2', '3', '4'])
      expect(participants(wrapper)).toHaveLength(4)
    })

    it('reassigns a participant of podium 6 to the first free podium of a smaller room', async () => {
      const wrapper = mountForm()
      const select = roomSelect(wrapper).get('select')
      await select.setValue('11')
      await addParticipants(wrapper, 5)
      // On retire les pupitres 2 et 3 : il reste 1, 4, 5, 6.
      await participants(wrapper)[2].get('[data-test="game-participant-remove"]').trigger('click')
      await participants(wrapper)[1].get('[data-test="game-participant-remove"]').trigger('click')
      await fillParticipant(wrapper, 3, { displayName: 'Six' })

      await select.setValue('10')

      expect(podiumValues(wrapper)).toEqual(['1', '4', '2', '3'])
      expect(
        wrapper.get<HTMLInputElement>('input[name="participants.3.displayName"]').element.value
      ).toBe('Six')
    })

    it('sends a 6-podium game to a 6-podium room', async () => {
      const wrapper = mountForm()
      await roomSelect(wrapper).get('select').setValue('11')
      await addParticipants(wrapper, 5)
      for (let index = 0; index < 6; index += 1) {
        await fillParticipant(wrapper, index, { displayName: `Équipe ${index + 1}` })
      }

      await submit(wrapper)

      expect(createGameServiceMock).toHaveBeenCalledTimes(1)
      const payload = createGameServiceMock.mock.calls[0][1] as {
        roomId: number
        participants: Array<{ podium: number }>
      }
      expect(payload.roomId).toBe(11)
      expect(payload.participants.map((participant) => participant.podium)).toEqual([
        1, 2, 3, 4, 5, 6,
      ])
    })

    it('shows the API error when a podium does not exist in the room', async () => {
      mockServiceFailure(createGameServiceMock, 'podium_not_in_room')
      const wrapper = mountForm()
      await roomSelect(wrapper).get('select').setValue('10')
      await fillParticipant(wrapper, 0, { displayName: 'Léa' })

      await submit(wrapper)

      expect(wrapper.text()).toContain('games.errors.podiumNotInRoom')
    })
  })

  it('does not call the API when the form is invalid', async () => {
    const wrapper = mountForm()

    await submit(wrapper)

    expect(createGameServiceMock).not.toHaveBeenCalled()
    expect(roomSelect(wrapper).attributes('error')).toBe('games.form.errors.roomRequired')
    expect(wrapper.text()).toContain('games.form.errors.displayNameRequired')
  })

  it('blocks an email without the explicit GDPR consent', async () => {
    const wrapper = mountForm()

    await roomSelect(wrapper).get('select').setValue('10')
    await fillParticipant(wrapper, 0, { displayName: 'Team A', email: 'a@quizzup.test' })
    await submit(wrapper)

    expect(createGameServiceMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('games.form.errors.consentRequired')
  })

  it('sends the game once the consent is ticked', async () => {
    const wrapper = mountForm()

    await roomSelect(wrapper).get('select').setValue('11')
    await fillParticipant(wrapper, 0, { displayName: ' Team A ', email: 'a@quizzup.test' })
    await wrapper.get('[data-test="game-participant-consent"]').setValue(true)
    await wrapper.get('[data-test="game-add-participant"]').trigger('click')
    await fillParticipant(wrapper, 1, { displayName: 'Team B' })
    await wrapper.get('input[name="roundsCount"]').setValue('5')
    await submit(wrapper)

    expect(createGameServiceMock).toHaveBeenCalledWith(1, {
      roomId: 11,
      roundsCount: 5,
      questionsPerRound: 10,
      participants: [
        { podium: 1, displayName: 'Team A', email: 'a@quizzup.test', emailConsent: true },
        { podium: 2, displayName: 'Team B' },
      ],
    })
    expect(wrapper.emitted('created')?.[0]?.[0]).toMatchObject({ id: 99 })
  })

  it('opens and removes the second player block of a podium', async () => {
    const wrapper = mountForm()

    expect(wrapper.find('[data-test="game-second-player"]').exists()).toBe(false)

    await wrapper.get('[data-test="game-second-player-add"]').trigger('click')

    expect(wrapper.find('[data-test="game-second-player"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="game-second-player-add"]').exists()).toBe(false)
    expect(
      wrapper.get<HTMLInputElement>('[data-test="game-second-player-consent"]').element.checked
    ).toBe(false)

    await wrapper.get('input[name="participants.0.secondPlayer.displayName"]').setValue('Alex')
    await wrapper.get('[data-test="game-second-player-remove"]').trigger('click')

    expect(wrapper.find('[data-test="game-second-player"]').exists()).toBe(false)

    await wrapper.get('[data-test="game-second-player-add"]').trigger('click')

    expect(
      wrapper.get<HTMLInputElement>('input[name="participants.0.secondPlayer.displayName"]').element
        .value
    ).toBe('')
  })

  it('validates the second player like the first one', async () => {
    const wrapper = mountForm()

    await roomSelect(wrapper).get('select').setValue('10')
    await fillParticipant(wrapper, 0, { displayName: 'Team A' })
    await wrapper.get('[data-test="game-second-player-add"]').trigger('click')
    await wrapper
      .get('input[name="participants.0.secondPlayer.email"]')
      .setValue('alex@quizzup.test')
    await submit(wrapper)

    expect(createGameServiceMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('games.form.errors.displayNameRequired')
    expect(wrapper.text()).toContain('games.form.errors.consentRequired')
  })

  it('sends the second player of a podium once its consent is ticked', async () => {
    const wrapper = mountForm()

    await roomSelect(wrapper).get('select').setValue('10')
    await fillParticipant(wrapper, 0, { displayName: 'Team A' })
    await wrapper.get('[data-test="game-second-player-add"]').trigger('click')
    await wrapper.get('input[name="participants.0.secondPlayer.displayName"]').setValue(' Alex ')
    await wrapper
      .get('input[name="participants.0.secondPlayer.email"]')
      .setValue('alex@quizzup.test')
    await wrapper.get('[data-test="game-second-player-consent"]').setValue(true)
    await submit(wrapper)

    expect(createGameServiceMock).toHaveBeenCalledWith(1, {
      roomId: 10,
      roundsCount: 10,
      questionsPerRound: 10,
      participants: [
        {
          podium: 1,
          displayName: 'Team A',
          secondPlayer: { displayName: 'Alex', email: 'alex@quizzup.test', emailConsent: true },
        },
      ],
    })
  })

  it('preselects the only active room', async () => {
    const wrapper = mountForm([
      { id: 10, name: 'Salle Néon', status: ROOM_STATUS_ACTIVE },
      { id: 12, name: 'Salle fermée', status: ROOM_STATUS_INACTIVE },
    ])

    await fillParticipant(wrapper, 0, { displayName: 'Team A' })
    await submit(wrapper)

    expect(createGameServiceMock).toHaveBeenCalledWith(1, expect.objectContaining({ roomId: 10 }))
  })

  it('blocks the launch when the company has no active room', async () => {
    const wrapper = mountForm([{ id: 12, name: 'Salle fermée', status: ROOM_STATUS_INACTIVE }])

    expect(wrapper.text()).toContain('games.form.noActiveRoom')
    expect(wrapper.get('[data-test="form-actions-submit"]').attributes('disabled')).toBeDefined()
  })

  it('shows a busy room on the room field', async () => {
    mockServiceFailure(createGameServiceMock, 'room_busy', 409)
    const wrapper = mountForm()

    await roomSelect(wrapper).get('select').setValue('10')
    await fillParticipant(wrapper, 0, { displayName: 'Team A' })
    await submit(wrapper)

    expect(roomSelect(wrapper).attributes('error')).toBe('games.errors.roomBusy')
    expect(wrapper.emitted('created')).toBeUndefined()
  })

  it('shows the API consent error as a form error', async () => {
    mockServiceFailure(createGameServiceMock, 'email_consent_required', 400)
    const wrapper = mountForm()

    await roomSelect(wrapper).get('select').setValue('10')
    await fillParticipant(wrapper, 0, { displayName: 'Team A' })
    await submit(wrapper)

    expect(wrapper.get('[data-test="form-result-error"]').text()).toBe(
      'games.errors.emailConsentRequired'
    )
  })

  it('cancels without calling the API', async () => {
    const wrapper = mountForm()

    await fillParticipant(wrapper, 0, { displayName: 'Team A' })
    await wrapper.get('[data-test="form-actions-cancel"]').trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(createGameServiceMock).not.toHaveBeenCalled()
  })
})
