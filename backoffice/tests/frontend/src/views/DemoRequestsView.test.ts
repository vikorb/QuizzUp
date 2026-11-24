import { confirmMock, setConfirmResult } from '@frontend-tests/_helpers/confirmMock'
import {
  deleteDemoRequestServiceMock,
  demoRequestFixture,
  loadDemoRequestsServiceMock,
  mockLoadDemoRequests,
  pendingDemoRequest,
  resetDemoRequestsServiceMock,
  updateDemoRequestServiceMock,
} from '@frontend-tests/_helpers/demoRequestsServiceMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import DemoRequestsView from '@/views/DemoRequestsView.vue'

vi.mock('@/services/demoRequestsService', async () => {
  const demoRequestsService = await import('@frontend-tests/_helpers/demoRequestsServiceMock')

  return demoRequestsService.demoRequestsServiceModuleMock
})

resetFrontendMocksBeforeEach()

beforeEach(() => {
  resetDemoRequestsServiceMock()
})

const MARK_PROCESSED = 'button[aria-label="demoRequests.actions.markProcessedFor"]'
const DELETE = 'button[aria-label="demoRequests.actions.deleteFor"]'

async function mountView(): Promise<VueWrapper> {
  const wrapper = mountWithFrontendMocks(DemoRequestsView)

  await flushPromises()

  return wrapper
}

function rowKeys(wrapper: VueWrapper): string[] {
  return wrapper
    .findAll('[data-test="base-table-row"]')
    .map((row) => row.attributes('data-row-key') ?? '')
}

async function chooseFilter(wrapper: VueWrapper, value: string): Promise<void> {
  await wrapper.find('[data-test="select-field"] select').setValue(value)
  await flushPromises()
}

describe('views/DemoRequestsView.vue', () => {
  it('carries the console surface marker', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('[data-test="section-layout"]').attributes('data-surface')).toBe('console')
  })

  it('shows the loading state while the requests are being fetched', async () => {
    let release: ((value: unknown) => void) | undefined
    loadDemoRequestsServiceMock.mockReturnValue(
      new Promise((resolve) => {
        release = resolve
      })
    )

    const wrapper = await mountView()

    expect(wrapper.find('[data-test="base-card"]').attributes('data-loading')).toBe('true')
    expect(wrapper.find('[data-test="base-card-loading"]').text()).toBe(
      'demoRequests.table.loading'
    )

    release?.({ ok: true, status: 200, data: { demoRequests: [], pendingCount: 0 } })
    await flushPromises()

    expect(wrapper.find('[data-test="base-card"]').attributes('data-loading')).toBe('false')
  })

  it('shows the error state with a retry that loads the list again', async () => {
    loadDemoRequestsServiceMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      error: 'server_error',
    })

    const wrapper = await mountView()

    expect(wrapper.find('[data-test="base-card-error"]').text()).toBe('server_error')
    expect(rowKeys(wrapper)).toEqual([])

    const retry = wrapper.find('[data-test="base-card-actions"] button')
    expect(retry.text()).toBe('demoRequests.table.retry')

    await retry.trigger('click')
    await flushPromises()

    expect(loadDemoRequestsServiceMock).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-test="base-card-error"]').exists()).toBe(false)
    expect(rowKeys(wrapper)).toEqual(['1'])
  })

  it('shows the empty state when nothing matches', async () => {
    mockLoadDemoRequests([])

    const wrapper = await mountView()

    expect(wrapper.find('[data-test="base-card-empty"]').text()).toBe('demoRequests.table.empty')
  })

  it('lists the requests to handle first, then filters the handled ones and all of them', async () => {
    const wrapper = await mountView()

    expect(rowKeys(wrapper)).toEqual(['1'])
    expect(wrapper.text()).toContain('Alice Martin')
    expect(wrapper.text()).toContain('Escape Néon')
    expect(wrapper.text()).not.toContain('Bruno Leroy')

    await chooseFilter(wrapper, 'processed')
    expect(rowKeys(wrapper)).toEqual(['2'])

    await chooseFilter(wrapper, 'all')
    expect(rowKeys(wrapper)).toEqual(['1', '2'])

    await wrapper.find('[data-test="base-toolbar-reset"]').trigger('click')
    expect(rowKeys(wrapper)).toEqual(['1'])
  })

  it('marks a request as handled, drops it from the pending list and tells the user', async () => {
    const wrapper = await mountView()

    await wrapper.find(MARK_PROCESSED).trigger('click')
    await flushPromises()

    expect(updateDemoRequestServiceMock).toHaveBeenCalledWith(1, true)
    expect(rowKeys(wrapper)).toEqual([])
    expect(wrapper.find('[data-test="base-banner"]').text()).toContain('demoRequestProcessed')

    await chooseFilter(wrapper, 'processed')
    expect(rowKeys(wrapper)).toEqual(['1', '2'])
  })

  it('offers no handled button on a request that is already handled', async () => {
    const wrapper = await mountView()
    await chooseFilter(wrapper, 'processed')

    expect(rowKeys(wrapper)).toEqual(['2'])
    expect(wrapper.find(MARK_PROCESSED).exists()).toBe(false)
  })

  it('keeps the request and shows the error code when marking fails', async () => {
    updateDemoRequestServiceMock.mockResolvedValue({
      ok: false,
      status: 500,
      error: 'server_error',
    })

    const wrapper = await mountView()
    await wrapper.find(MARK_PROCESSED).trigger('click')
    await flushPromises()

    expect(rowKeys(wrapper)).toEqual(['1'])
    expect(wrapper.find('[data-test="base-banner"]').text()).toContain('server_error')
  })

  it('drops the row but keeps the error message when marking a request deleted elsewhere', async () => {
    updateDemoRequestServiceMock.mockResolvedValue({ ok: false, status: 404, error: 'not_found' })

    const wrapper = await mountView()
    await wrapper.find(MARK_PROCESSED).trigger('click')
    await flushPromises()

    expect(rowKeys(wrapper)).toEqual([])
    await chooseFilter(wrapper, 'all')
    expect(rowKeys(wrapper)).toEqual(['2'])
    expect(wrapper.find('[data-test="base-banner"]').text()).toContain('not_found')
  })

  it('deletes a request once the user confirms', async () => {
    const wrapper = await mountView()

    await wrapper.find(DELETE).trigger('click')
    await flushPromises()

    expect(confirmMock).toHaveBeenCalledTimes(1)
    expect(confirmMock.mock.calls[0]![0]).toMatchObject({ variant: 'danger' })
    expect(deleteDemoRequestServiceMock).toHaveBeenCalledWith(1)
    expect(rowKeys(wrapper)).toEqual([])
    expect(wrapper.find('[data-test="base-banner"]').text()).toContain('demoRequestDeleted')

    await chooseFilter(wrapper, 'all')
    expect(rowKeys(wrapper)).toEqual(['2'])
  })

  it('does nothing when the user cancels the deletion', async () => {
    setConfirmResult(false)

    const wrapper = await mountView()
    await wrapper.find(DELETE).trigger('click')
    await flushPromises()

    expect(confirmMock).toHaveBeenCalledTimes(1)
    expect(deleteDemoRequestServiceMock).not.toHaveBeenCalled()
    expect(rowKeys(wrapper)).toEqual(['1'])
  })

  it('keeps the request and shows the error code when the deletion fails', async () => {
    deleteDemoRequestServiceMock.mockResolvedValue({ ok: false, error: 'forbidden' })

    const wrapper = await mountView()
    await wrapper.find(DELETE).trigger('click')
    await flushPromises()

    expect(rowKeys(wrapper)).toEqual(['1'])
    expect(wrapper.find('[data-test="base-banner"]').text()).toContain('forbidden')
  })

  it('treats a request already deleted elsewhere as a successful deletion', async () => {
    deleteDemoRequestServiceMock.mockResolvedValue({ ok: false, error: 'not_found' })

    const wrapper = await mountView()
    await wrapper.find(DELETE).trigger('click')
    await flushPromises()

    expect(rowKeys(wrapper)).toEqual([])
    const banner = wrapper.find('[data-test="base-banner"]')
    expect(banner.text()).toContain('demoRequestDeleted')
    expect(banner.text()).not.toContain('not_found')
    await chooseFilter(wrapper, 'all')
    expect(rowKeys(wrapper)).toEqual(['2'])
  })

  describe('while an action is running', () => {
    const second = demoRequestFixture({ id: 3, name: 'Chloé Durand' })

    it('disables the buttons and runs a single update', async () => {
      let release: ((value: unknown) => void) | undefined
      updateDemoRequestServiceMock.mockReturnValue(
        new Promise((resolve) => {
          release = resolve
        })
      )
      mockLoadDemoRequests([pendingDemoRequest, second])

      const wrapper = await mountView()
      const buttons = wrapper.findAll(MARK_PROCESSED)
      await buttons[0]!.trigger('click')
      await flushPromises()

      expect(buttons[0]!.attributes('disabled')).toBeDefined()
      await buttons[0]!.trigger('click')
      // L'autre ligne n'est pas désactivée : seul le garde-fou de la fonction l'arrête.
      await buttons[1]!.trigger('click')
      await flushPromises()

      expect(updateDemoRequestServiceMock).toHaveBeenCalledTimes(1)

      release?.({ ok: true, status: 200, data: { demoRequest: demoRequestFixture() } })
      await flushPromises()
    })

    it('disables the buttons and runs a single deletion', async () => {
      let release: ((value: unknown) => void) | undefined
      deleteDemoRequestServiceMock.mockReturnValue(
        new Promise((resolve) => {
          release = resolve
        })
      )
      mockLoadDemoRequests([pendingDemoRequest, second])

      const wrapper = await mountView()
      const buttons = wrapper.findAll(DELETE)
      await buttons[0]!.trigger('click')
      await flushPromises()

      expect(buttons[0]!.attributes('disabled')).toBeDefined()
      await buttons[0]!.trigger('click')
      await buttons[1]!.trigger('click')
      await flushPromises()

      expect(confirmMock).toHaveBeenCalledTimes(1)
      expect(deleteDemoRequestServiceMock).toHaveBeenCalledTimes(1)

      release?.({ ok: true })
      await flushPromises()
    })
  })

  it('shows a dash for a missing message and omits a missing phone', async () => {
    mockLoadDemoRequests([demoRequestFixture({ message: null, phone: null })])

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('—')
    expect(wrapper.text()).not.toContain(String(pendingDemoRequest.phone))
  })
})
