import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { describe, expect, it } from 'vitest'

import BasePagination from '@/components/ui/BasePagination.vue'

resetFrontendMocksBeforeEach()

function mountPagination(props: Record<string, unknown> = {}) {
  return mountWithFrontendMocks(BasePagination, {
    props: { total: 120, offset: 0, limit: 50, ...props },
    global: {
      mocks: {
        $t: (key: string, params?: Record<string, unknown>) =>
          params ? `${key} ${JSON.stringify(params)}` : key,
      },
    },
  })
}

const previous = (wrapper: ReturnType<typeof mountPagination>) =>
  wrapper.get('[data-test="pagination-previous"]')
const next = (wrapper: ReturnType<typeof mountPagination>) =>
  wrapper.get('[data-test="pagination-next"]')

describe('components/ui/BasePagination.vue', () => {
  it('shows the range of the first page, with no previous page', () => {
    const wrapper = mountPagination()

    expect(wrapper.get('[data-test="pagination-range"]').text()).toBe(
      'pagination.range {"from":1,"to":50,"total":120}'
    )
    expect(previous(wrapper).attributes('disabled')).toBeDefined()
    expect(next(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('goes to the next page, then back to the previous one', async () => {
    const wrapper = mountPagination({ offset: 50 })

    await next(wrapper).trigger('click')
    await previous(wrapper).trigger('click')

    expect(wrapper.emitted('update:offset')).toEqual([[100], [0]])
  })

  it('never goes below the first item', async () => {
    const wrapper = mountPagination({ offset: 20 })

    await previous(wrapper).trigger('click')

    expect(wrapper.emitted('update:offset')).toEqual([[0]])
  })

  it('cuts the range of the last page at the total, with no next page', () => {
    const wrapper = mountPagination({ offset: 100 })

    expect(wrapper.get('[data-test="pagination-range"]').text()).toContain('"from":101,"to":120')
    expect(next(wrapper).attributes('disabled')).toBeDefined()
  })

  it('has no next page when the total is exactly one page', () => {
    expect(next(mountPagination({ total: 50 })).attributes('disabled')).toBeDefined()
  })

  it('ignores the clicks while loading, without natively disabling the buttons (keeps the keyboard focus)', async () => {
    const wrapper = mountPagination({ offset: 50, disabled: true })

    expect(previous(wrapper).attributes('aria-disabled')).toBe('true')
    expect(next(wrapper).attributes('aria-disabled')).toBe('true')
    expect(previous(wrapper).attributes('disabled')).toBeUndefined()
    expect(next(wrapper).attributes('disabled')).toBeUndefined()

    await next(wrapper).trigger('click')
    await previous(wrapper).trigger('click')

    expect(wrapper.emitted('update:offset')).toBeUndefined()
  })

  it('is not aria-disabled once loaded', () => {
    const wrapper = mountPagination({ offset: 50 })

    expect(previous(wrapper).attributes('aria-disabled')).toBeUndefined()
    expect(next(wrapper).attributes('aria-disabled')).toBeUndefined()
  })

  it('keeps the first and last page bounds natively disabled while loading', () => {
    const first = mountPagination({ offset: 0, disabled: true })
    const last = mountPagination({ offset: 100, disabled: true })

    expect(previous(first).attributes('disabled')).toBeDefined()
    expect(next(last).attributes('disabled')).toBeDefined()
  })

  it('announces the range politely to screen readers', () => {
    expect(mountPagination().get('[data-test="pagination-range"]').attributes('aria-live')).toBe(
      'polite'
    )
  })

  it('renders nothing without any item', () => {
    expect(mountPagination({ total: 0 }).find('nav').exists()).toBe(false)
  })
})
