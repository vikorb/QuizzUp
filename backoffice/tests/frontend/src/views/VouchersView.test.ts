import {
  setAuthenticatedAdmin,
  setAuthenticatedSuperadmin,
  setAuthenticatedUser,
} from '@frontend-tests/_helpers/authStateMock'
import { loadCompaniesServiceMock } from '@frontend-tests/_helpers/companiesServiceMock'
import { confirmMock, setConfirmResult } from '@frontend-tests/_helpers/confirmMock'
import { mountWithFrontendMocks, tWithParamsMock } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { currentRouteMock, replaceMock } from '@frontend-tests/_helpers/routerMock'
import {
  cancelVoucherServiceMock,
  createVoucherFixture,
  listVouchersServiceMock,
  lookupVoucherServiceMock,
  mockVoucherFailure,
  redeemVoucherServiceMock,
} from '@frontend-tests/_helpers/vouchersServiceMock'
import { VOUCHER_LIST_DEFAULT_LIMIT } from '@quizzup/shared'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'

import VouchersView from '@/views/VouchersView.vue'

resetFrontendMocksBeforeEach()

beforeEach(() => {
  setAuthenticatedAdmin({ companyId: 7 })
})

async function mountView(): Promise<VueWrapper> {
  const wrapper = mountWithFrontendMocks(VouchersView)

  await flushPromises()

  return wrapper
}

function rows(wrapper: VueWrapper) {
  return wrapper.findAll('[data-test="base-table-row"]')
}

function findSelect(wrapper: VueWrapper, label: string) {
  const field = wrapper
    .findAll('[data-test="select-field"]')
    .find((candidate) => candidate.find('span').text() === label)

  if (!field) {
    throw new Error(`select ${label} not found`)
  }

  return field.get('select')
}

async function search(wrapper: VueWrapper, code: string): Promise<void> {
  await wrapper.get('input[name="voucher-code"]').setValue(code)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

const listed = [
  createVoucherFixture({ id: 1, code: '7K2M-9QXP', displayName: 'Team A' }),
  createVoucherFixture({
    id: 2,
    code: 'AB3D-EF4G',
    displayName: 'Team B',
    secondDisplayName: 'Alex',
    state: 'redeemed',
  }),
  createVoucherFixture({ id: 3, code: 'HJ5K-LM6N', displayName: 'Team C', state: 'expired' }),
]

describe('views/VouchersView.vue', () => {
  describe('list', () => {
    it('reads the first page of the vouchers of the company of the user', async () => {
      await mountView()

      expect(listVouchersServiceMock).toHaveBeenCalledWith(7, {
        state: undefined,
        limit: VOUCHER_LIST_DEFAULT_LIMIT,
        offset: 0,
      })
    })

    it('shows the empty state when there is no voucher', async () => {
      const wrapper = await mountView()

      expect(wrapper.text()).toContain('vouchers.list.empty')
      expect(rows(wrapper)).toHaveLength(0)
    })

    it('shows the loading state while the list is read', async () => {
      listVouchersServiceMock.mockImplementation(() => new Promise(() => undefined))
      const wrapper = mountWithFrontendMocks(VouchersView)

      await flushPromises()

      expect(wrapper.text()).toContain('vouchers.list.loading')
    })

    it('shows one row per voucher, with its code, holders and state', async () => {
      listVouchersServiceMock.mockResolvedValue({
        ok: true,
        status: 200,
        data: { vouchers: listed, total: 3 },
      })
      const wrapper = await mountView()
      const lines = rows(wrapper)

      expect(lines).toHaveLength(3)
      expect(lines[0]?.text()).toContain('7K2M-9QXP')
      expect(lines[0]?.text()).toContain('vouchers.state.valid')
      expect(lines[1]?.text()).toContain('Team B · Alex')
      expect(lines[1]?.text()).toContain('vouchers.state.redeemed')
      expect(lines[2]?.text()).toContain('vouchers.state.expired')
    })

    it('shows the translated error, never the code, and a retry that reads the list again', async () => {
      mockVoucherFailure(listVouchersServiceMock, 'server_error', 500)
      const wrapper = await mountView()

      expect(wrapper.text()).toContain('vouchers.list.retry')
      expect(wrapper.get('[data-test="vouchers-list-error"]').text()).toBe(
        'vouchers.errors.serverError'
      )

      listVouchersServiceMock.mockResolvedValue({
        ok: true,
        status: 200,
        data: { vouchers: listed, total: 3 },
      })
      const retry = wrapper
        .findAll('[data-test="base-card-actions"] button')
        .find((button) => button.text() === 'vouchers.list.retry')

      await retry?.trigger('click')
      await flushPromises()

      expect(listVouchersServiceMock).toHaveBeenCalledTimes(2)
      expect(rows(wrapper)).toHaveLength(3)
    })

    it.each([
      ['not_found', 404, 'vouchers.errors.notFound'],
      ['forbidden', 403, 'vouchers.errors.forbidden'],
      ['api_unreachable', null, 'vouchers.errors.apiUnreachable'],
    ])('translates the list error %s with the vouchers texts', async (code, status, key) => {
      mockVoucherFailure(listVouchersServiceMock, code, status as number)
      const wrapper = await mountView()

      expect(wrapper.get('[data-test="vouchers-list-error"]').text()).toBe(key)
    })

    it('tells that no company is chosen, without an error and without a useless retry', async () => {
      setAuthenticatedSuperadmin({ companyId: null })
      const wrapper = await mountView()

      expect(listVouchersServiceMock).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain('vouchers.search.noCompany')
      expect(wrapper.find('[data-test="vouchers-list-error"]').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('vouchers.list.retry')
    })

    it('goes back to the last page that exists when the last voucher of the last page is gone', async () => {
      const pageSize = VOUCHER_LIST_DEFAULT_LIMIT
      let total = pageSize + 1

      listVouchersServiceMock.mockImplementation(async (_companyId, query) => {
        const offset = (query as { offset: number }).offset
        const count = Math.max(0, Math.min(pageSize, total - offset))

        return {
          ok: true,
          status: 200,
          data: {
            vouchers: Array.from({ length: count }, (_value, index) =>
              createVoucherFixture({ id: offset + index + 1, code: `AAAA-${offset + index + 1}` })
            ),
            total,
          },
        }
      })
      cancelVoucherServiceMock.mockImplementation(async () => {
        total -= 1

        return {
          ok: true,
          status: 200,
          data: { voucher: createVoucherFixture({ state: 'cancelled' }) },
        }
      })
      const wrapper = await mountView()

      await wrapper.get('[data-test="pagination-next"]').trigger('click')
      await flushPromises()

      expect(rows(wrapper)).toHaveLength(1)

      await rows(wrapper)[0]?.get('[data-test="voucher-cancel"]').trigger('click')
      await flushPromises()

      expect(listVouchersServiceMock).toHaveBeenLastCalledWith(
        7,
        expect.objectContaining({ offset: 0 })
      )
      expect(rows(wrapper)).toHaveLength(pageSize)
      expect(wrapper.find('[data-test="base-card-empty"]').exists()).toBe(false)
    })

    it('reloads from the first page when the state filter changes', async () => {
      const wrapper = await mountView()

      await findSelect(wrapper, 'vouchers.filters.state').setValue('redeemed')
      await flushPromises()

      expect(listVouchersServiceMock).toHaveBeenLastCalledWith(
        7,
        expect.objectContaining({ state: 'redeemed', offset: 0 })
      )
    })

    it('reads the next page with the page size of the shared constant', async () => {
      listVouchersServiceMock.mockResolvedValue({
        ok: true,
        status: 200,
        data: { vouchers: listed, total: VOUCHER_LIST_DEFAULT_LIMIT * 2 },
      })
      const wrapper = await mountView()

      await wrapper.get('[data-test="pagination-next"]').trigger('click')
      await flushPromises()

      expect(listVouchersServiceMock).toHaveBeenLastCalledWith(
        7,
        expect.objectContaining({ offset: VOUCHER_LIST_DEFAULT_LIMIT })
      )
    })

    it('ignores an older answer that arrives after a newer request', async () => {
      let resolveFirst!: (value: unknown) => void
      listVouchersServiceMock.mockImplementationOnce(
        () => new Promise((resolve) => (resolveFirst = resolve)) as never
      )
      const wrapper = mountWithFrontendMocks(VouchersView)

      await flushPromises()
      await findSelect(wrapper, 'vouchers.filters.state').setValue('valid')
      await flushPromises()
      resolveFirst({ ok: false, status: 500, error: 'server_error' })
      await flushPromises()

      expect(wrapper.text()).not.toContain('vouchers.list.retry')
    })
  })

  describe('companies', () => {
    it('does not offer the company selector to an admin', async () => {
      const wrapper = await mountView()

      expect(loadCompaniesServiceMock).not.toHaveBeenCalled()
      expect(wrapper.findAll('[data-test="select-field"]')).toHaveLength(1)
    })

    it('lets a superadmin pick another company, and reloads the list', async () => {
      setAuthenticatedSuperadmin({ companyId: 1 })
      const wrapper = await mountView()

      expect(loadCompaniesServiceMock).toHaveBeenCalledTimes(1)

      await findSelect(wrapper, 'vouchers.filters.company').setValue('2')
      await flushPromises()

      expect(replaceMock).toHaveBeenCalledWith({ name: 'vouchers', query: { companyId: '2' } })
      expect(listVouchersServiceMock).toHaveBeenLastCalledWith(2, expect.any(Object))
    })

    it('opens the company given in the address for a superadmin', async () => {
      setAuthenticatedSuperadmin({ companyId: 1 })
      currentRouteMock.query = { companyId: '2' }

      await mountView()

      expect(listVouchersServiceMock).toHaveBeenCalledWith(2, expect.any(Object))
    })
  })

  describe('search', () => {
    it('does not call the server for a malformed code and says so', async () => {
      const wrapper = await mountView()

      await search(wrapper, 'abc')

      expect(lookupVoucherServiceMock).not.toHaveBeenCalled()
      expect(wrapper.get('[data-test="form-field-error"]').text()).toBe('vouchers.search.malformed')
      expect(wrapper.find('[data-test="voucher-detail"]').exists()).toBe(false)
    })

    it('keeps the search button disabled while the field is empty', async () => {
      const wrapper = await mountView()

      expect(
        wrapper.get('[data-test="voucher-search-submit"]').attributes('disabled')
      ).toBeDefined()
    })

    it('looks the code up in its stored form, however it was typed', async () => {
      const wrapper = await mountView()

      await search(wrapper, ' 7k2m 9qxp ')

      expect(lookupVoucherServiceMock).toHaveBeenCalledWith(7, '7K2M-9QXP')
      expect(wrapper.get('[data-test="voucher-detail-code"]').text()).toBe('7K2M-9QXP')
      expect(wrapper.get('[data-test="voucher-detail-label"]').text()).toBe('Une partie offerte')
      expect(wrapper.get('[data-test="voucher-detail-state"]').text()).toContain(
        'vouchers.state.valid'
      )
    })

    it('shows the translated error when the code is unknown', async () => {
      mockVoucherFailure(lookupVoucherServiceMock, 'voucher_not_found', 404)
      const wrapper = await mountView()

      await search(wrapper, '7K2M-9QXP')

      expect(wrapper.get('[data-test="voucher-search-message"]').text()).toBe(
        'vouchers.errors.voucherNotFound'
      )
      expect(wrapper.find('[data-test="voucher-detail"]').exists()).toBe(false)
    })

    it.each(['redeemed', 'expired', 'cancelled'] as const)(
      'offers no redeem on a %s voucher',
      async (state) => {
        lookupVoucherServiceMock.mockResolvedValue({
          ok: true,
          status: 200,
          data: { voucher: createVoucherFixture({ state }) },
        })
        const wrapper = await mountView()

        await search(wrapper, '7K2M-9QXP')

        expect(wrapper.get('[data-test="voucher-detail-state"]').text()).toContain(
          `vouchers.state.${state}`
        )
        expect(wrapper.find('[data-test="voucher-redeem"]').exists()).toBe(false)
      }
    )

    it('redeems a valid voucher, shows it as used and reloads the list', async () => {
      const wrapper = await mountView()

      await search(wrapper, '7K2M-9QXP')
      listVouchersServiceMock.mockClear()
      await wrapper.get('[data-test="voucher-redeem"]').trigger('click')
      await flushPromises()

      expect(redeemVoucherServiceMock).toHaveBeenCalledWith(7, '7K2M-9QXP')
      expect(wrapper.get('[data-test="voucher-search-message"]').text()).toBe(
        'vouchers.search.redeemed'
      )
      expect(wrapper.get('[data-test="voucher-detail-state"]').text()).toContain(
        'vouchers.state.redeemed'
      )
      expect(wrapper.find('[data-test="voucher-redeem"]').exists()).toBe(false)
      expect(listVouchersServiceMock).toHaveBeenCalledTimes(1)
    })

    it.each([
      ['voucher_already_redeemed', 'redeemed', 'vouchers.errors.voucherAlreadyRedeemed'],
      ['voucher_expired', 'expired', 'vouchers.errors.voucherExpired'],
      ['voucher_cancelled', 'cancelled', 'vouchers.errors.voucherCancelled'],
    ] as const)(
      'shows the translated error %s when the voucher changed since the search, and reads its state again',
      async (code, state, key) => {
        const wrapper = await mountView()

        await search(wrapper, '7K2M-9QXP')
        mockVoucherFailure(redeemVoucherServiceMock, code, code === 'voucher_expired' ? 410 : 409)
        lookupVoucherServiceMock.mockResolvedValue({
          ok: true,
          status: 200,
          data: { voucher: createVoucherFixture({ state }) },
        })
        await wrapper.get('[data-test="voucher-redeem"]').trigger('click')
        await flushPromises()

        expect(wrapper.get('[data-test="voucher-search-message"]').text()).toBe(key)
        expect(wrapper.get('[data-test="voucher-detail-state"]').text()).toContain(
          `vouchers.state.${state}`
        )
        expect(wrapper.find('[data-test="voucher-redeem"]').exists()).toBe(false)
      }
    )
  })

  describe('cancel', () => {
    beforeEach(() => {
      listVouchersServiceMock.mockResolvedValue({
        ok: true,
        status: 200,
        data: { vouchers: listed, total: 3 },
      })
    })

    it('offers it to an admin on the vouchers that can still be cancelled only', async () => {
      const wrapper = await mountView()

      expect(rows(wrapper)[0]?.find('[data-test="voucher-cancel"]').exists()).toBe(true)
      expect(rows(wrapper)[1]?.find('[data-test="voucher-cancel"]').exists()).toBe(false)
      expect(rows(wrapper)[2]?.find('[data-test="voucher-cancel"]').exists()).toBe(true)
    })

    it('does not offer it to staff, whom the matrix does not allow it', async () => {
      setAuthenticatedUser({ companyId: 7 })
      const wrapper = await mountView()

      expect(rows(wrapper)).toHaveLength(3)
      expect(wrapper.find('[data-test="voucher-cancel"]').exists()).toBe(false)
    })

    it('asks for confirmation, cancels, then reads the list again', async () => {
      const wrapper = await mountView()

      listVouchersServiceMock.mockClear()
      await rows(wrapper)[0]?.get('[data-test="voucher-cancel"]').trigger('click')
      await flushPromises()

      expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' }))
      expect(cancelVoucherServiceMock).toHaveBeenCalledWith(7, 1)
      expect(listVouchersServiceMock).toHaveBeenCalledTimes(1)
      expect(wrapper.get('[data-test="base-banner"]').text()).toContain('vouchers.cancel.done')
    })

    it('does nothing when the confirmation is refused', async () => {
      setConfirmResult(false)
      const wrapper = await mountView()

      await rows(wrapper)[0]?.get('[data-test="voucher-cancel"]').trigger('click')
      await flushPromises()

      expect(cancelVoucherServiceMock).not.toHaveBeenCalled()
    })

    it('waits for the running cancel: one confirmation, buttons disabled meanwhile', async () => {
      let answer!: (value: boolean) => void

      confirmMock.mockImplementationOnce(
        () => new Promise<boolean>((resolve) => (answer = resolve))
      )
      const wrapper = await mountView()
      const button = () => rows(wrapper)[0]?.get('[data-test="voucher-cancel"]')

      await button()?.trigger('click')
      await flushPromises()

      expect(button()?.attributes('disabled')).toBeDefined()

      // Même un second événement « annuler » (autre bouton, touche) n'ouvre pas une seconde confirmation.
      wrapper.findComponent({ name: 'VouchersTable' }).vm.$emit('cancel', listed[0])
      await flushPromises()

      expect(confirmMock).toHaveBeenCalledTimes(1)

      answer(true)
      await flushPromises()

      expect(cancelVoucherServiceMock).toHaveBeenCalledTimes(1)
      expect(button()?.attributes('disabled')).toBeUndefined()
    })

    it('names the voucher on each cancel button for screen readers', async () => {
      const wrapper = mountWithFrontendMocks(VouchersView, {
        global: { mocks: { $t: tWithParamsMock } },
      })

      await flushPromises()

      expect(rows(wrapper)[0]?.get('[data-test="voucher-cancel"]').attributes('aria-label')).toBe(
        'vouchers.cancel.ariaLabel:{"code":"7K2M-9QXP"}'
      )
    })

    it('shows the translated error when the cancel is refused', async () => {
      mockVoucherFailure(cancelVoucherServiceMock, 'voucher_already_redeemed')
      const wrapper = await mountView()

      await rows(wrapper)[0]?.get('[data-test="voucher-cancel"]').trigger('click')
      await flushPromises()

      expect(wrapper.get('[data-test="base-banner"]').text()).toContain(
        'vouchers.errors.voucherAlreadyRedeemed'
      )
    })
  })
})
