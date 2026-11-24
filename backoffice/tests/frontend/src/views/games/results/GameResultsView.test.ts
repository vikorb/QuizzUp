import {
  setAuthenticatedAdmin,
  setAuthenticatedSuperadmin,
} from '@frontend-tests/_helpers/authStateMock'
import {
  loadCompanyDetailsServiceMock,
  mockLoadCompanyDetailsFailure,
} from '@frontend-tests/_helpers/companiesServiceMock'
import {
  createGameFixture,
  createParticipantFixture,
  loadGameServiceMock,
  mockServiceFailure,
  resetGamesServiceMock,
} from '@frontend-tests/_helpers/gamesServiceMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { currentRouteMock, pushMock } from '@frontend-tests/_helpers/routerMock'
import {
  createVoucherFixture,
  listGameVouchersServiceMock,
} from '@frontend-tests/_helpers/vouchersServiceMock'
import { GAME_STATE_FINISHED, GAME_STATE_RUNNING } from '@quizzup/shared'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Game } from '@/types/game'
import GameResultsView from '@/views/games/results/GameResultsView.vue'

vi.mock('@/services/gamesService', async () => {
  const gamesService = await import('@frontend-tests/_helpers/gamesServiceMock')

  return gamesService.gamesServiceModuleMock
})

resetFrontendMocksBeforeEach()

const printMock = vi.fn()

beforeEach(() => {
  resetGamesServiceMock()
  setAuthenticatedAdmin({ companyId: 1 })
  currentRouteMock.params = { gameId: '4' }
  currentRouteMock.query = {}
  printMock.mockReset()
  vi.spyOn(window, 'print').mockImplementation(printMock)
})

function finishedGame(overrides: Partial<Game> = {}): Game {
  return createGameFixture({
    id: 4,
    state: GAME_STATE_FINISHED,
    finishedAt: '2026-11-03T15:30:00.000Z',
    participants: [
      createParticipantFixture({ id: 1, podium: 1, displayName: 'Team A', score: 12 }),
      createParticipantFixture({ id: 2, podium: 2, displayName: 'Team B', score: 7 }),
      createParticipantFixture({ id: 3, podium: 3, displayName: 'Team C', score: 7 }),
      createParticipantFixture({ id: 4, podium: 4, displayName: 'Team D', score: 2 }),
    ],
    ...overrides,
  })
}

function mockGame(game: Game): void {
  loadGameServiceMock.mockResolvedValue({ ok: true, status: 200, data: { game } })
}

async function mountView(): Promise<VueWrapper> {
  const wrapper = mountWithFrontendMocks(GameResultsView)

  await flushPromises()

  return wrapper
}

function rowTexts(wrapper: VueWrapper, test: string): string[] {
  return wrapper.findAll(`[data-test="${test}"]`).map((cell) => cell.text())
}

function mockVouchers(...vouchers: ReturnType<typeof createVoucherFixture>[]): void {
  listGameVouchersServiceMock.mockResolvedValue({
    ok: true,
    status: 200,
    data: { vouchers },
  })
}

describe('views/games/results/GameResultsView.vue', () => {
  it('shows the company, the room, the date and the ranking of a finished game', async () => {
    mockGame(finishedGame())

    const wrapper = await mountView()

    expect(loadGameServiceMock).toHaveBeenCalledWith(1, 4)
    expect(loadCompanyDetailsServiceMock).toHaveBeenCalledWith(1)
    expect(wrapper.get('[data-test="results-company"]').text()).toBe('Acme Corp')
    expect(wrapper.get('[data-test="results-room"]').text()).toBe('Salle Néon')
    expect(wrapper.get('[data-test="results-date"]').text()).not.toBe('—')
    expect(rowTexts(wrapper, 'results-rank')).toEqual(['1', '2', '2', '4'])
    expect(rowTexts(wrapper, 'results-names')).toEqual(['Team A', 'Team B', 'Team C', 'Team D'])
    expect(rowTexts(wrapper, 'results-score')).toEqual(['12', '7', '7', '2'])
  })

  it('shows the second player of a team under the first one', async () => {
    mockGame(
      finishedGame({
        participants: [
          createParticipantFixture({
            id: 1,
            displayName: 'Team A',
            score: 3,
            secondPlayer: {
              displayName: 'Alex',
              email: null,
              hasEmail: false,
              consentAt: null,
              marketingConsent: false,
            },
          }),
        ],
      })
    )

    const wrapper = await mountView()

    expect(wrapper.get('[data-test="results-names"]').text()).toContain('Team A')
    expect(wrapper.get('[data-test="results-names"]').text()).toContain('Alex')
  })

  it('never puts a player email in the page, even when the API sends one', async () => {
    mockGame(
      finishedGame({
        participants: [
          createParticipantFixture({
            id: 1,
            podium: 1,
            displayName: 'Team A',
            email: 'first@quizzup.test',
            hasEmail: true,
            consentAt: '2026-11-03T10:00:00.000Z',
            score: 5,
            secondPlayer: {
              displayName: 'Alex',
              email: 'second@quizzup.test',
              hasEmail: true,
              consentAt: '2026-11-03T10:00:00.000Z',
              marketingConsent: false,
            },
          }),
        ],
      })
    )

    const wrapper = await mountView()

    expect(wrapper.findAll('[data-test="results-row"]')).toHaveLength(1)
    expect(wrapper.html()).not.toContain('quizzup.test')
    expect(wrapper.html()).not.toContain('@')
  })

  it('prints the sheet with the browser print dialog', async () => {
    mockGame(finishedGame())

    const wrapper = await mountView()

    await wrapper.get('[data-test="results-print"]').trigger('click')

    expect(printMock).toHaveBeenCalledTimes(1)
  })

  it('has a single primary button', async () => {
    mockGame(finishedGame())

    const wrapper = await mountView()
    const primary = wrapper.findAll('[data-variant="primary"]')

    expect(primary).toHaveLength(1)
    expect(primary[0].text()).toBe('games.results.print')
  })

  it('goes back to the game', async () => {
    mockGame(finishedGame())

    const wrapper = await mountView()

    await wrapper.get('[data-test="results-back"]').trigger('click')

    expect(pushMock).toHaveBeenCalledWith({
      name: 'games-detail',
      params: { gameId: '4' },
      query: {},
    })
  })

  it('keeps the company of the query for the superadmin', async () => {
    setAuthenticatedSuperadmin({ companyId: 1 })
    currentRouteMock.query = { companyId: '7' }
    mockGame(finishedGame())

    const wrapper = await mountView()

    expect(loadGameServiceMock).toHaveBeenCalledWith(7, 4)

    await wrapper.get('[data-test="results-back"]').trigger('click')

    expect(pushMock).toHaveBeenCalledWith({
      name: 'games-detail',
      params: { gameId: '4' },
      query: { companyId: '7' },
    })
  })

  it('stays printable when the company name cannot be read', async () => {
    mockLoadCompanyDetailsFailure('forbidden')
    mockGame(finishedGame())

    const wrapper = await mountView()

    expect(wrapper.find('[data-test="results-company"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-test="results-row"]')).toHaveLength(4)
  })

  it('shows the loading state while the game loads', async () => {
    loadGameServiceMock.mockReturnValue(new Promise(() => {}))

    const wrapper = mountWithFrontendMocks(GameResultsView)

    await flushPromises()

    expect(wrapper.get('[data-test="results-loading"]').text()).toBe('games.results.loading')
    expect(wrapper.find('[data-test="results-print"]').exists()).toBe(false)
  })

  it('shows the translated error when the game cannot be loaded', async () => {
    mockServiceFailure(loadGameServiceMock, 'not_found', 404)

    const wrapper = await mountView()

    expect(wrapper.get('[data-test="results-error"]').text()).toBe('games.errors.notFound')
    expect(wrapper.find('[data-test="results-row"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="results-print"]').exists()).toBe(false)
  })

  it('rejects an invalid game id without calling the API', async () => {
    currentRouteMock.params = { gameId: 'abc' }

    const wrapper = await mountView()

    expect(loadGameServiceMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="results-error"]').exists()).toBe(true)
  })

  it('shows an empty state for a finished game without participant', async () => {
    mockGame(finishedGame({ participants: [] }))

    const wrapper = await mountView()

    expect(wrapper.get('[data-test="results-empty"]').text()).toBe('games.results.empty')
    expect(wrapper.find('[data-test="results-print"]').exists()).toBe(false)
  })

  it('refuses the sheet of a game that is not finished', async () => {
    mockGame(finishedGame({ state: GAME_STATE_RUNNING }))

    const wrapper = await mountView()

    expect(wrapper.get('[data-test="results-unfinished"]').text()).toBe('games.results.notFinished')
    expect(wrapper.find('[data-test="results-row"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="results-print"]').exists()).toBe(false)
  })

  describe('vouchers', () => {
    it('reads the vouchers of the game in the company of the sheet', async () => {
      mockGame(finishedGame())

      await mountView()

      expect(listGameVouchersServiceMock).toHaveBeenCalledWith(1, 4)
    })

    it('prints no voucher block when no voucher was issued', async () => {
      mockGame(finishedGame())

      const wrapper = await mountView()

      expect(wrapper.find('[data-test="results-vouchers"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="results-row"]').exists()).toBe(true)
    })

    it('prints the label, the holders and the code of each valid voucher', async () => {
      mockGame(finishedGame())
      mockVouchers(
        createVoucherFixture({ id: 1, code: '7K2M-9QXP', displayName: 'Team A' }),
        createVoucherFixture({
          id: 2,
          code: 'AB3D-EF4G',
          displayName: 'Team B',
          secondDisplayName: 'Alex',
          label: 'Un verre offert',
        })
      )

      const wrapper = await mountView()

      expect(rowTexts(wrapper, 'results-voucher-code')).toEqual(['7K2M-9QXP', 'AB3D-EF4G'])
      expect(rowTexts(wrapper, 'results-voucher-label')).toEqual([
        'Une partie offerte',
        'Un verre offert',
      ])
      expect(wrapper.findAll('[data-test="results-voucher"]')[1]?.text()).toContain('Team B · Alex')
      expect(wrapper.get('[data-test="results-vouchers"]').text()).toContain('vouchers.sheet.title')
    })

    it.each(['redeemed', 'expired', 'cancelled'] as const)(
      'does not print a %s voucher',
      async (state) => {
        mockGame(finishedGame())
        mockVouchers(
          createVoucherFixture({ id: 1, code: '7K2M-9QXP' }),
          createVoucherFixture({ id: 2, code: 'AB3D-EF4G', state })
        )

        const wrapper = await mountView()

        expect(rowTexts(wrapper, 'results-voucher-code')).toEqual(['7K2M-9QXP'])
      }
    )

    describe('qr code', () => {
      const qrSvg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><path d="M0 0h1v1H0z"/></svg>'

      it('prints the qr code of a voucher as an image with a translated description', async () => {
        mockGame(finishedGame())
        mockVouchers(createVoucherFixture({ code: '7K2M-9QXP', qrSvg }))

        const wrapper = await mountView()
        const image = wrapper.get('[data-test="results-voucher-qr"]')

        expect(image.element.tagName).toBe('IMG')
        expect(image.attributes('src')).toBe(
          `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`
        )
        expect(image.attributes('alt')).toBe('vouchers.sheet.qrAlt')
        expect(wrapper.get('[data-test="results-voucher-code"]').text()).toBe('7K2M-9QXP')
      })

      it('never injects a hostile svg into the page', async () => {
        const hostile =
          '<svg viewBox="0 0 1 1"><script>window.pwned = 1</script><img src="x" onerror="window.pwned = 2"></svg>'

        mockGame(finishedGame())
        mockVouchers(createVoucherFixture({ qrSvg: hostile }))

        const wrapper = await mountView()
        const voucher = wrapper.get('[data-test="results-voucher"]')

        expect(voucher.findAll('img')).toHaveLength(1)
        expect(voucher.find('script').exists()).toBe(false)
        expect(voucher.find('svg').exists()).toBe(false)
        expect(voucher.find('[onerror]').exists()).toBe(false)
        expect(voucher.get('img').attributes('src')).not.toContain('<')
      })

      it.each([
        ['absent', undefined],
        ['null', null],
        ['empty', ''],
      ])('keeps the plain code only when the qr code is %s', async (_name, value) => {
        mockGame(finishedGame())
        mockVouchers(createVoucherFixture({ code: '7K2M-9QXP', qrSvg: value }))

        const wrapper = await mountView()

        expect(wrapper.find('[data-test="results-voucher-qr"]').exists()).toBe(false)
        expect(wrapper.get('[data-test="results-voucher-code"]').text()).toBe('7K2M-9QXP')
      })
    })

    it('keeps the sheet printable when the vouchers cannot be read', async () => {
      mockGame(finishedGame())
      listGameVouchersServiceMock.mockRejectedValue(new Error('network'))

      const wrapper = await mountView()

      expect(wrapper.find('[data-test="results-vouchers"]').exists()).toBe(false)
      expect(wrapper.findAll('[data-test="results-row"]')).toHaveLength(4)
      expect(wrapper.find('[data-test="results-print"]').exists()).toBe(true)
    })

    it('keeps the sheet printable when the server refuses the vouchers', async () => {
      mockGame(finishedGame())
      listGameVouchersServiceMock.mockResolvedValue({
        ok: false,
        status: 403,
        error: 'forbidden',
      })

      const wrapper = await mountView()

      expect(wrapper.find('[data-test="results-vouchers"]').exists()).toBe(false)
      expect(wrapper.findAll('[data-test="results-row"]')).toHaveLength(4)
    })
  })
})
