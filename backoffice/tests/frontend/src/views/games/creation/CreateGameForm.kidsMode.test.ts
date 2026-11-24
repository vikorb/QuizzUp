import { confirmMock, setConfirmResult } from '@frontend-tests/_helpers/confirmMock'
import {
  createGameServiceMock,
  createParticipantFixture,
  createScheduledGameFixture,
  resetGamesServiceMock,
  roomsFixture,
  updateGameServiceMock,
} from '@frontend-tests/_helpers/gamesServiceMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Game } from '@/types/game'
import CreateGameForm from '@/views/games/creation/CreateGameForm.vue'

vi.mock('@/services/gamesService', async () => {
  const gamesService = await import('@frontend-tests/_helpers/gamesServiceMock')

  return gamesService.gamesServiceModuleMock
})

resetFrontendMocksBeforeEach()

beforeEach(() => {
  resetGamesServiceMock()
})

function mountForm(props: { game?: Game | null } = {}): VueWrapper {
  return mountWithFrontendMocks(CreateGameForm, {
    props: { companyId: 1, rooms: roomsFixture, ...props },
  })
}

const kidsSwitch = (wrapper: VueWrapper) => wrapper.get('[data-test="game-kids-mode"]')

async function submit(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

async function fillAndSubmitCreation(wrapper: VueWrapper): Promise<void> {
  await wrapper.findAll('[data-test="select-field"]')[0]!.get('select').setValue('10')
  await wrapper.get('input[name="participants.0.displayName"]').setValue('Les Quizzeurs')
  await submit(wrapper)
}

const scheduledGame = (overrides: Partial<Game> = {}) =>
  createScheduledGameFixture('2026-12-05T13:00:00.000Z', { id: 5, roomId: 10, ...overrides })

const withEmail = () =>
  scheduledGame({
    participants: [
      createParticipantFixture({
        email: 'lea@exemple.fr',
        hasEmail: true,
        consentAt: '2026-12-01T10:00:00.000Z',
      }),
    ],
  })

describe('views/games/creation/CreateGameForm.vue: kids mode', () => {
  it('offers the switch off, with its label and its hint', () => {
    const wrapper = mountForm()
    const id = kidsSwitch(wrapper).attributes('id')

    expect(kidsSwitch(wrapper).attributes('aria-checked')).toBe('false')
    expect(wrapper.get(`label[for="${id}"]`).text()).toBe('games.form.kidsMode')
    expect(wrapper.get(`#${kidsSwitch(wrapper).attributes('aria-describedby')}`).text()).toBe(
      'games.form.kidsModeHint'
    )
  })

  it('sends no kidsMode when the switch is left off', async () => {
    const wrapper = mountForm()

    await fillAndSubmitCreation(wrapper)

    expect(createGameServiceMock).toHaveBeenCalledTimes(1)
    expect(createGameServiceMock.mock.calls[0]?.[1]).not.toHaveProperty('kidsMode')
  })

  it('creates the game with kidsMode when the switch is on', async () => {
    const wrapper = mountForm()

    await kidsSwitch(wrapper).trigger('click')
    await fillAndSubmitCreation(wrapper)

    expect(kidsSwitch(wrapper).attributes('aria-checked')).toBe('true')
    expect(createGameServiceMock).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ roomId: 10, kidsMode: true })
    )
  })

  it('sends no kidsMode when the switch is turned on then off again', async () => {
    const wrapper = mountForm()

    await kidsSwitch(wrapper).trigger('click')
    await kidsSwitch(wrapper).trigger('click')
    await fillAndSubmitCreation(wrapper)

    expect(createGameServiceMock.mock.calls[0]?.[1]).not.toHaveProperty('kidsMode')
  })

  describe('player e-mail', () => {
    it('offers the e-mail field and the consent outside kids mode', () => {
      const wrapper = mountForm()

      expect(wrapper.find('input[name="participants.0.email"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="game-participant-consent"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="game-kids-no-email"]').exists()).toBe(false)
    })

    it('hides the e-mail field and the consent in kids mode, with an explanation', async () => {
      const wrapper = mountForm()

      await kidsSwitch(wrapper).trigger('click')

      expect(wrapper.find('input[name="participants.0.email"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="game-participant-consent"]').exists()).toBe(false)
      expect(wrapper.get('[data-test="game-kids-no-email"]').text()).toBe('games.form.kidsNoEmail')
    })

    it('sends no e-mail typed before the switch was turned on', async () => {
      const wrapper = mountForm()

      await wrapper.get('input[name="participants.0.email"]').setValue('lea@exemple.fr')
      await kidsSwitch(wrapper).trigger('click')
      await fillAndSubmitCreation(wrapper)

      expect(createGameServiceMock).toHaveBeenCalledTimes(1)
      const payload = createGameServiceMock.mock.calls[0]?.[1] as {
        participants: Record<string, unknown>[]
      }
      const participant = payload.participants[0]

      expect(participant).not.toHaveProperty('email')
      expect(participant).not.toHaveProperty('emailConsent')
    })
  })

  describe('confirmation before erasing the saved e-mails', () => {
    it('asks once, in danger variant, then switches on and empties the e-mail when accepted', async () => {
      const wrapper = mountForm({ game: withEmail() })

      expect(
        (wrapper.get('input[name="participants.0.email"]').element as HTMLInputElement).value
      ).toBe('lea@exemple.fr')

      await kidsSwitch(wrapper).trigger('click')
      await flushPromises()

      expect(confirmMock).toHaveBeenCalledTimes(1)
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'games.form.kidsConfirmMessage', variant: 'danger' })
      )
      expect(kidsSwitch(wrapper).attributes('aria-checked')).toBe('true')
      expect(wrapper.find('input[name="participants.0.email"]').exists()).toBe(false)

      await submit(wrapper)

      expect(updateGameServiceMock.mock.calls[0]?.[2]).toMatchObject({ kidsMode: true })
    })

    it('leaves the switch off and the e-mail in place when refused', async () => {
      setConfirmResult(false)
      const wrapper = mountForm({ game: withEmail() })

      await kidsSwitch(wrapper).trigger('click')
      await flushPromises()

      expect(confirmMock).toHaveBeenCalledTimes(1)
      expect(kidsSwitch(wrapper).attributes('aria-checked')).toBe('false')
      expect(
        (wrapper.get('input[name="participants.0.email"]').element as HTMLInputElement).value
      ).toBe('lea@exemple.fr')

      await submit(wrapper)

      expect(updateGameServiceMock.mock.calls[0]?.[2]).not.toHaveProperty('kidsMode')
    })

    it('works for an account whose players are locked: only kidsMode is sent', async () => {
      const wrapper = mountForm({
        game: scheduledGame({
          participants: [createParticipantFixture({ email: null, hasEmail: true })],
        }),
      })

      await kidsSwitch(wrapper).trigger('click')
      await flushPromises()
      await submit(wrapper)

      expect(confirmMock).toHaveBeenCalledTimes(1)
      expect(updateGameServiceMock.mock.calls[0]?.[2]).toMatchObject({ kidsMode: true })
      expect(updateGameServiceMock.mock.calls[0]?.[2]).not.toHaveProperty('participants')
    })

    it('does not ask when the session is already in kids mode and the switch goes off', async () => {
      const wrapper = mountForm({ game: scheduledGame({ kidsMode: true }) })

      await kidsSwitch(wrapper).trigger('click')
      await flushPromises()

      expect(confirmMock).not.toHaveBeenCalled()
      expect(kidsSwitch(wrapper).attributes('aria-checked')).toBe('false')
    })

    it('does not ask when creating a game', async () => {
      const wrapper = mountForm()

      await kidsSwitch(wrapper).trigger('click')
      await flushPromises()

      expect(confirmMock).not.toHaveBeenCalled()
      expect(kidsSwitch(wrapper).attributes('aria-checked')).toBe('true')
    })
  })

  describe('editing a scheduled session', () => {
    it('shows the switch as it is saved', () => {
      expect(
        kidsSwitch(mountForm({ game: scheduledGame({ kidsMode: true }) })).attributes(
          'aria-checked'
        )
      ).toBe('true')
      expect(kidsSwitch(mountForm({ game: scheduledGame() })).attributes('aria-checked')).toBe(
        'false'
      )
    })

    it('sends no kidsMode when the switch is untouched', async () => {
      const wrapper = mountForm({ game: scheduledGame({ kidsMode: true }) })

      await submit(wrapper)

      expect(updateGameServiceMock).toHaveBeenCalledTimes(1)
      expect(updateGameServiceMock.mock.calls[0]?.[2]).not.toHaveProperty('kidsMode')
    })

    it('sends kidsMode true when it is switched on', async () => {
      const wrapper = mountForm({ game: scheduledGame() })

      await kidsSwitch(wrapper).trigger('click')
      await submit(wrapper)

      expect(updateGameServiceMock.mock.calls[0]?.[2]).toMatchObject({ kidsMode: true })
    })

    it('sends kidsMode false when it is switched off', async () => {
      const wrapper = mountForm({ game: scheduledGame({ kidsMode: true }) })

      await kidsSwitch(wrapper).trigger('click')
      await submit(wrapper)

      expect(updateGameServiceMock.mock.calls[0]?.[2]).toMatchObject({ kidsMode: false })
    })
  })
})
