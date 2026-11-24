import { setAuthenticatedAdmin, setAuthenticatedUser } from '@frontend-tests/_helpers/authStateMock'
import { confirmMock, setConfirmResult } from '@frontend-tests/_helpers/confirmMock'
import {
  createGameFixture,
  createParticipantFixture,
} from '@frontend-tests/_helpers/gamesServiceMock'
import { mountWithFrontendMocks, tWithParamsMock } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import {
  cancelVoucherServiceMock,
  createVoucherFixture,
  issueGameVoucherServiceMock,
  listGameVouchersServiceMock,
  mockVoucherFailure,
} from '@frontend-tests/_helpers/vouchersServiceMock'
import { GAME_STATE_FINISHED, GAME_STATE_PENDING, GAME_STATE_RUNNING } from '@quizzup/shared'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import type { Game } from '@/types/game'
import GameVouchersPanel from '@/views/games/detail/GameVouchersPanel.vue'

resetFrontendMocksBeforeEach()

function createFinishedGame(overrides: Partial<Game> = {}): Game {
  return createGameFixture({
    id: 4,
    companyId: 7,
    state: GAME_STATE_FINISHED,
    finishedAt: '2026-11-03T11:00:00.000Z',
    participants: [
      createParticipantFixture({ id: 12, podium: 2, displayName: 'Team B' }),
      createParticipantFixture({
        id: 11,
        podium: 1,
        displayName: 'Team A',
        secondPlayer: {
          displayName: 'Alex',
          email: null,
          hasEmail: false,
          consentAt: null,
          marketingConsent: false,
        },
      }),
    ],
    ...overrides,
  })
}

async function mountPanel(game: Game = createFinishedGame()): Promise<VueWrapper> {
  const wrapper = mountWithFrontendMocks(GameVouchersPanel, { props: { game } })

  await flushPromises()

  return wrapper
}

function desk(wrapper: VueWrapper, podium: number) {
  return wrapper.get(`[data-test="game-voucher-desk-${podium}"]`)
}

beforeEach(() => {
  setAuthenticatedAdmin({ companyId: 7 })
})

describe('views/games/detail/GameVouchersPanel.vue', () => {
  it('reads the vouchers of the game in the company of the game', async () => {
    await mountPanel()

    expect(listGameVouchersServiceMock).toHaveBeenCalledWith(7, 4)
  })

  it.each([[GAME_STATE_RUNNING], [GAME_STATE_PENDING]])(
    'shows nothing while the game is %s, and asks nothing',
    async (state) => {
      const wrapper = await mountPanel(createFinishedGame({ state }))

      expect(wrapper.find('[data-test="game-vouchers-panel"]').exists()).toBe(false)
      expect(listGameVouchersServiceMock).not.toHaveBeenCalled()
    }
  )

  it('lists the desks in podium order with one issue button each', async () => {
    const wrapper = await mountPanel()
    const lines = wrapper.findAll('[data-test^="game-voucher-desk-"]')

    expect(lines.map((line) => line.attributes('data-test'))).toEqual([
      'game-voucher-desk-1',
      'game-voucher-desk-2',
    ])
    expect(desk(wrapper, 1).text()).toContain('Team A · Alex')
    expect(desk(wrapper, 2).text()).toContain('Team B')
    expect(wrapper.findAll('[data-test="game-voucher-issue"]')).toHaveLength(2)
  })

  it('has a single primary button: the first desk without a voucher', async () => {
    const wrapper = await mountPanel()

    expect(wrapper.findAll('[data-variant="primary"]')).toHaveLength(1)
    expect(
      desk(wrapper, 1).get('[data-test="game-voucher-issue"]').attributes('data-variant')
    ).toBe('primary')
    expect(
      desk(wrapper, 2).get('[data-test="game-voucher-issue"]').attributes('data-variant')
    ).toBe('default')

    listGameVouchersServiceMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { vouchers: [createVoucherFixture({ participantId: 11, podium: 1 })] },
    })
    const afterFirst = await mountPanel()

    expect(
      desk(afterFirst, 2).get('[data-test="game-voucher-issue"]').attributes('data-variant')
    ).toBe('primary')
  })

  it('shows the loading state, then the empty state when the game has no desk', async () => {
    const wrapper = mountWithFrontendMocks(GameVouchersPanel, {
      props: { game: createFinishedGame({ participants: [] }) },
    })

    await nextTick()

    expect(wrapper.get('[data-test="game-vouchers-panel"]').attributes('data-loading')).toBe('true')

    await flushPromises()

    expect(wrapper.get('[data-test="game-vouchers-panel"]').attributes('data-empty')).toBe('true')
  })

  it('shows the error state, with a retry that reads the vouchers again', async () => {
    mockVoucherFailure(listGameVouchersServiceMock, 'server_error', 500)
    const wrapper = await mountPanel()

    expect(wrapper.get('[data-test="game-vouchers-error"]').text()).toBe(
      'vouchers.errors.serverError'
    )

    listGameVouchersServiceMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { vouchers: [] },
    })
    await wrapper.get('[data-test="base-card-actions"] button').trigger('click')
    await flushPromises()

    expect(listGameVouchersServiceMock).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-test="game-vouchers-error"]').exists()).toBe(false)
  })

  it('translates a not found error with the vouchers texts', async () => {
    mockVoucherFailure(listGameVouchersServiceMock, 'not_found', 404)
    const wrapper = await mountPanel()

    expect(wrapper.get('[data-test="game-vouchers-error"]').text()).toBe('vouchers.errors.notFound')
  })

  it('reads the vouchers again, and says why, when a desk turns out to have its voucher already', async () => {
    mockVoucherFailure(issueGameVoucherServiceMock, 'voucher_already_issued')
    const wrapper = await mountPanel()

    listGameVouchersServiceMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { vouchers: [createVoucherFixture({ participantId: 11, podium: 1 })] },
    })
    await desk(wrapper, 1).get('[data-test="game-voucher-issue"]').trigger('click')
    await flushPromises()

    expect(listGameVouchersServiceMock).toHaveBeenCalledTimes(2)
    expect(desk(wrapper, 1).find('[data-test="game-voucher-code"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="base-banner"]').text()).toContain(
      'vouchers.errors.voucherAlreadyIssued'
    )
  })

  it('does not read the vouchers again after other refusals', async () => {
    mockVoucherFailure(issueGameVoucherServiceMock, 'game_not_finished')
    const wrapper = await mountPanel()

    await desk(wrapper, 1).get('[data-test="game-voucher-issue"]').trigger('click')
    await flushPromises()

    expect(listGameVouchersServiceMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['admin', () => setAuthenticatedAdmin({ companyId: 7 }), 'vouchers.errors.vouchersDisabled'],
    [
      'staff',
      () => setAuthenticatedUser({ companyId: 7 }),
      'vouchers.errors.vouchersDisabledStaff',
    ],
  ])('words the disabled vouchers for %s', async (_role, signIn, key) => {
    signIn()
    mockVoucherFailure(issueGameVoucherServiceMock, 'vouchers_disabled')
    const wrapper = await mountPanel()

    await desk(wrapper, 1).get('[data-test="game-voucher-issue"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="base-banner"]').text()).toMatch(new RegExp(`^${key}(?!Staff)`))
    expect(wrapper.get('[data-test="base-banner"]').text().includes('Staff')).toBe(
      key.endsWith('Staff')
    )
  })

  it('names the desk on each issue button and the code on each cancel button', async () => {
    listGameVouchersServiceMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { vouchers: [createVoucherFixture({ participantId: 11, podium: 1 })] },
    })
    const wrapper = mountWithFrontendMocks(GameVouchersPanel, {
      props: { game: createFinishedGame() },
      global: { mocks: { $t: tWithParamsMock } },
    })

    await flushPromises()

    expect(desk(wrapper, 2).get('[data-test="game-voucher-issue"]').attributes('aria-label')).toBe(
      'vouchers.panel.issueAria:{"podium":2}'
    )
    expect(desk(wrapper, 1).get('[data-test="game-voucher-cancel"]').attributes('aria-label')).toBe(
      'vouchers.cancel.ariaLabel:{"code":"7K2M-9QXP"}'
    )
  })

  it('shows the voucher already issued to a desk, with its state, and no issue button for it', async () => {
    listGameVouchersServiceMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { vouchers: [createVoucherFixture({ participantId: 11, podium: 1 })] },
    })
    const wrapper = await mountPanel()

    expect(desk(wrapper, 1).get('[data-test="game-voucher-code"]').text()).toBe('7K2M-9QXP')
    expect(desk(wrapper, 1).get('[data-test="game-voucher-state"]').text()).toContain(
      'vouchers.state.valid'
    )
    expect(desk(wrapper, 1).find('[data-test="game-voucher-issue"]').exists()).toBe(false)
    expect(desk(wrapper, 2).find('[data-test="game-voucher-issue"]').exists()).toBe(true)
  })

  it('issues the voucher of a desk and shows its code at once', async () => {
    issueGameVoucherServiceMock.mockResolvedValue({
      ok: true,
      status: 201,
      data: { voucher: createVoucherFixture({ id: 9, participantId: 12, code: 'AB3D-EF4G' }) },
    })
    const wrapper = await mountPanel()

    await desk(wrapper, 2).get('[data-test="game-voucher-issue"]').trigger('click')
    await flushPromises()

    expect(issueGameVoucherServiceMock).toHaveBeenCalledWith(7, 4, 12)
    expect(desk(wrapper, 2).get('[data-test="game-voucher-code"]').text()).toBe('AB3D-EF4G')
    expect(desk(wrapper, 1).find('[data-test="game-voucher-issue"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="base-banner"]').text()).toContain('vouchers.panel.issued')
  })

  it.each([
    ['voucher_already_issued', 'vouchers.errors.voucherAlreadyIssued'],
    ['vouchers_disabled', 'vouchers.errors.vouchersDisabled'],
    ['game_not_finished', 'vouchers.errors.gameNotFinished'],
  ])('shows the translated error %s when the issue is refused', async (code, key) => {
    mockVoucherFailure(issueGameVoucherServiceMock, code)
    const wrapper = await mountPanel()

    await desk(wrapper, 1).get('[data-test="game-voucher-issue"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="base-banner"]').text()).toContain(key)
    expect(wrapper.get('[data-test="base-banner"]').text()).not.toContain(code)
    expect(desk(wrapper, 1).find('[data-test="game-voucher-code"]').exists()).toBe(false)
  })

  describe('cancel', () => {
    beforeEach(() => {
      listGameVouchersServiceMock.mockResolvedValue({
        ok: true,
        status: 200,
        data: { vouchers: [createVoucherFixture({ id: 5, participantId: 11, podium: 1 })] },
      })
    })

    it('asks for confirmation, then cancels and shows the cancelled state', async () => {
      cancelVoucherServiceMock.mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          voucher: createVoucherFixture({
            id: 5,
            participantId: 11,
            podium: 1,
            state: 'cancelled',
          }),
        },
      })
      const wrapper = await mountPanel()

      await wrapper.get('[data-test="game-voucher-cancel"]').trigger('click')
      await flushPromises()

      expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' }))
      expect(cancelVoucherServiceMock).toHaveBeenCalledWith(7, 5)
      expect(desk(wrapper, 1).get('[data-test="game-voucher-state"]').text()).toContain(
        'vouchers.state.cancelled'
      )
      expect(wrapper.find('[data-test="game-voucher-cancel"]').exists()).toBe(false)
    })

    it('does nothing when the confirmation is refused', async () => {
      setConfirmResult(false)
      const wrapper = await mountPanel()

      await wrapper.get('[data-test="game-voucher-cancel"]').trigger('click')
      await flushPromises()

      expect(cancelVoucherServiceMock).not.toHaveBeenCalled()
      expect(desk(wrapper, 1).get('[data-test="game-voucher-state"]').text()).toContain(
        'vouchers.state.valid'
      )
    })

    it('shows the translated error when the cancel is refused', async () => {
      mockVoucherFailure(cancelVoucherServiceMock, 'voucher_already_redeemed')
      const wrapper = await mountPanel()

      await wrapper.get('[data-test="game-voucher-cancel"]').trigger('click')
      await flushPromises()

      expect(wrapper.get('[data-test="base-banner"]').text()).toContain(
        'vouchers.errors.voucherAlreadyRedeemed'
      )
    })

    it('reads the vouchers again, and says why, when the voucher was used elsewhere', async () => {
      mockVoucherFailure(cancelVoucherServiceMock, 'voucher_already_redeemed')
      const wrapper = await mountPanel()

      listGameVouchersServiceMock.mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          vouchers: [
            createVoucherFixture({ id: 5, participantId: 11, podium: 1, state: 'redeemed' }),
          ],
        },
      })
      await wrapper.get('[data-test="game-voucher-cancel"]').trigger('click')
      await flushPromises()

      expect(listGameVouchersServiceMock).toHaveBeenCalledTimes(2)
      expect(desk(wrapper, 1).get('[data-test="game-voucher-state"]').text()).toContain(
        'vouchers.state.redeemed'
      )
      expect(wrapper.get('[data-test="base-banner"]').text()).toContain(
        'vouchers.errors.voucherAlreadyRedeemed'
      )
    })

    it('does not offer the cancel to staff, whom the matrix does not allow it', async () => {
      setAuthenticatedUser({ companyId: 7 })
      const wrapper = await mountPanel()

      expect(desk(wrapper, 1).find('[data-test="game-voucher-code"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="game-voucher-cancel"]').exists()).toBe(false)
    })

    it.each(['redeemed', 'cancelled'] as const)(
      'does not offer the cancel of a %s voucher',
      async (state) => {
        listGameVouchersServiceMock.mockResolvedValue({
          ok: true,
          status: 200,
          data: { vouchers: [createVoucherFixture({ participantId: 11, podium: 1, state })] },
        })
        const wrapper = await mountPanel()

        expect(wrapper.find('[data-test="game-voucher-cancel"]').exists()).toBe(false)
      }
    )
  })

  it('reads the vouchers when the game turns finished while the page is open', async () => {
    const wrapper = await mountPanel(createFinishedGame({ state: GAME_STATE_RUNNING }))

    expect(listGameVouchersServiceMock).not.toHaveBeenCalled()

    await wrapper.setProps({ game: createFinishedGame() })
    await flushPromises()

    expect(listGameVouchersServiceMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-test="game-vouchers-panel"]').exists()).toBe(true)
  })
})
