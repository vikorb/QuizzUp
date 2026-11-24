import {
  createGameServiceMock,
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
