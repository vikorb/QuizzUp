import {
  createGameServiceMock,
  createScheduledGameFixture,
  mockServiceFailure,
  resetGamesServiceMock,
  roomsFixture,
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

const openJoinSwitch = (wrapper: VueWrapper) => wrapper.find('[data-test="game-open-join"]')
const participants = (wrapper: VueWrapper) => wrapper.findAll('fieldset.participant')

async function chooseRoom(wrapper: VueWrapper): Promise<void> {
  await wrapper.findAll('[data-test="select-field"]')[0]!.get('select').setValue('10')
}

async function submit(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('views/games/creation/CreateGameForm.vue: sign-up by QR code', () => {
  it('offers the switch off, with one participant to fill in', () => {
    const wrapper = mountForm()

    expect(openJoinSwitch(wrapper).exists()).toBe(true)
    expect(openJoinSwitch(wrapper).attributes('aria-checked')).toBe('false')
    expect(participants(wrapper)).toHaveLength(1)
    expect(wrapper.text()).toContain('games.form.participantsHint')
  })

  it('has a clickable label and a hint tied to the switch', () => {
    const wrapper = mountForm()
    const switchId = openJoinSwitch(wrapper).attributes('id')
    const describedBy = openJoinSwitch(wrapper).attributes('aria-describedby')

    expect(switchId).toBeTruthy()
    expect(wrapper.get(`label[for="${switchId}"]`).text()).toBe('games.form.openJoin')
    expect(describedBy).toBeTruthy()
    expect(wrapper.get(`#${describedBy}`).text()).toBe('games.form.openJoinHint')
  })

  it('toggles the switch when its label is clicked', async () => {
    const wrapper = mountWithFrontendMocks(CreateGameForm, {
      props: { companyId: 1, rooms: roomsFixture },
      attachTo: document.body,
    })

    await wrapper.get('label[for="game-form-open-join"]').trigger('click')

    expect(openJoinSwitch(wrapper).attributes('aria-checked')).toBe('true')
  })

  it('makes participants optional once it is on', async () => {
    const wrapper = mountForm()

    await openJoinSwitch(wrapper).trigger('click')

    expect(openJoinSwitch(wrapper).attributes('aria-checked')).toBe('true')
    expect(participants(wrapper)).toHaveLength(0)
    expect(wrapper.text()).toContain('games.form.participantsHintOpenJoin')
  })

  it('creates the game with openJoin and no participant', async () => {
    const wrapper = mountForm()

    await chooseRoom(wrapper)
    await openJoinSwitch(wrapper).trigger('click')
    await submit(wrapper)

    expect(createGameServiceMock).toHaveBeenCalledTimes(1)
    expect(createGameServiceMock).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ roomId: 10, openJoin: true, participants: [] })
    )
    expect(wrapper.emitted('created')).toHaveLength(1)
  })

  it('sends the participants already typed along with openJoin', async () => {
    const wrapper = mountForm()

    await chooseRoom(wrapper)
    await wrapper.get('input[name="participants.0.displayName"]').setValue('Les Quizzeurs')
    await openJoinSwitch(wrapper).trigger('click')
    await submit(wrapper)

    expect(createGameServiceMock).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        openJoin: true,
        participants: [expect.objectContaining({ podium: 1, displayName: 'Les Quizzeurs' })],
      })
    )
  })

  it('still refuses a game with no participant when the switch is off', async () => {
    const wrapper = mountForm()

    await chooseRoom(wrapper)
    await submit(wrapper)

    expect(createGameServiceMock).not.toHaveBeenCalled()
    expect(createGameServiceMock).not.toHaveBeenCalledWith(
      1,
      expect.objectContaining({ openJoin: true })
    )
  })

  it('sends no openJoin when the switch is off', async () => {
    const wrapper = mountForm()

    await chooseRoom(wrapper)
    await wrapper.get('input[name="participants.0.displayName"]').setValue('Les Quizzeurs')
    await submit(wrapper)

    expect(createGameServiceMock.mock.calls[0]?.[1]).not.toHaveProperty('openJoin')
  })

  it('puts one participant back when the switch is turned off again', async () => {
    const wrapper = mountForm()

    await openJoinSwitch(wrapper).trigger('click')
    await openJoinSwitch(wrapper).trigger('click')

    expect(participants(wrapper)).toHaveLength(1)
  })

  it('hides the switch for a scheduled session, which the link does not concern', async () => {
    const wrapper = mountForm()

    await wrapper.get('[data-test="game-scheduled"]').setValue(true)

    expect(openJoinSwitch(wrapper).exists()).toBe(false)
  })

  it('hides the switch when editing a scheduled session', () => {
    const wrapper = mountForm({
      game: createScheduledGameFixture('2026-12-05T13:00:00.000Z', { id: 5, roomId: 10 }),
    })

    expect(openJoinSwitch(wrapper).exists()).toBe(false)
  })

  it('shows the translated error of the API when the creation fails', async () => {
    mockServiceFailure(createGameServiceMock, 'company_inactive', 409)

    const wrapper = mountForm()

    await chooseRoom(wrapper)
    await openJoinSwitch(wrapper).trigger('click')
    await submit(wrapper)

    expect(wrapper.emitted('created')).toBeUndefined()
    expect(wrapper.get('[data-test="form-result-error"]').text()).toBe(
      'games.errors.companyInactive'
    )
  })
})
