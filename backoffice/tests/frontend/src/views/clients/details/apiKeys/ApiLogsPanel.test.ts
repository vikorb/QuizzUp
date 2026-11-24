import {
  createApiKeyFixture,
  createApiLogFixture,
  createDeferred,
  listApiLogsServiceMock,
  mockApiKeyFailure,
} from '@frontend-tests/_helpers/apiKeysServiceMock'
import { missingMessageKeys } from '@frontend-tests/_helpers/i18nMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import type { ApiKeyApiResult, ApiLogsResponse } from '@/types/apiKey'
import ApiLogsPanel from '@/views/clients/details/apiKeys/ApiLogsPanel.vue'

resetFrontendMocksBeforeEach()

afterEach(() => {
  missingMessageKeys.clear()
})

const apiKeys = [
  createApiKeyFixture({ id: 1, name: 'Site A' }),
  createApiKeyFixture({ id: 3, name: 'Site B', keyPrefix: 'qzk_bbbbbbbb' }),
]

function respond(logs: ReturnType<typeof createApiLogFixture>[], nextBefore: number | null = null) {
  listApiLogsServiceMock.mockResolvedValue({
    ok: true,
    status: 200,
    data: { logs, nextBefore },
  })
}

async function mountPanel(): Promise<VueWrapper> {
  const wrapper = mountWithFrontendMocks(ApiLogsPanel, { props: { companyId: 7, apiKeys } })

  await flushPromises()

  return wrapper
}

function card(wrapper: VueWrapper) {
  return wrapper.get('[data-test="api-logs-card"]')
}

async function pick(wrapper: VueWrapper, selectId: string, value: string): Promise<void> {
  await wrapper.get(`#${selectId} select`).setValue(value)
  await flushPromises()
}

describe('views/clients/details/apiKeys/ApiLogsPanel.vue', () => {
  it('reads the latest calls of the company without filter', async () => {
    await mountPanel()

    expect(listApiLogsServiceMock).toHaveBeenCalledTimes(1)
    expect(listApiLogsServiceMock.mock.calls[0]![0]).toBe(7)
    expect(listApiLogsServiceMock.mock.calls[0]![1]).toEqual({
      apiKeyId: undefined,
      statusClass: undefined,
      before: undefined,
    })
  })

  it('shows the loading state, then the empty state', async () => {
    const pending = createDeferred<ApiKeyApiResult<ApiLogsResponse>>()
    listApiLogsServiceMock.mockImplementationOnce(() => pending.promise)
    const wrapper = mountWithFrontendMocks(ApiLogsPanel, { props: { companyId: 7, apiKeys } })

    await nextTick()

    expect(card(wrapper).attributes('data-loading')).toBe('true')

    pending.resolve({ ok: true, status: 200, data: { logs: [], nextBefore: null } })
    await flushPromises()

    expect(card(wrapper).attributes('data-loading')).toBe('false')

    expect(card(wrapper).attributes('data-empty')).toBe('true')
  })

  it('shows the error state, and a refresh reads the log again', async () => {
    mockApiKeyFailure(listApiLogsServiceMock, 'server_error', 500)
    const wrapper = await mountPanel()

    expect(wrapper.get('[data-test="api-logs-error"]').text()).toBe('apiKeys.errors.serverError')

    respond([createApiLogFixture()])
    await wrapper.get('[data-test="api-logs-refresh"]').trigger('click')
    await flushPromises()

    expect(listApiLogsServiceMock).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-test="api-logs-error"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-test="base-table-row"]')).toHaveLength(1)
  })

  it('lists a call with its key, route, status and a link to the session', async () => {
    respond([
      createApiLogFixture({
        id: 9,
        method: 'POST',
        route: '/public/v1/bookings',
        statusCode: 201,
        gameId: 42,
      }),
    ])
    const wrapper = await mountPanel()
    const row = wrapper.get('[data-test="base-table-row"]')

    expect(row.text()).toContain('qzk_3f9a1c07')
    expect(row.text()).toContain('POST')
    expect(row.text()).toContain('/public/v1/bookings')
    expect(row.text()).toContain('201')
    expect(JSON.parse(row.get('[data-test="api-log-game"]').attributes('data-to')!)).toEqual({
      name: 'games-detail',
      params: { gameId: 42 },
    })
  })

  it('shows a dash when there is no error and no session', async () => {
    respond([createApiLogFixture({ errorCode: null, gameId: null })])
    const wrapper = await mountPanel()

    expect(wrapper.get('[data-test="api-log-error"]').text()).toBe('—')
    expect(wrapper.find('[data-test="api-log-game"]').exists()).toBe(false)
  })

  it('translates a known error code and shows an unknown one as it is', async () => {
    respond([
      createApiLogFixture({ id: 2, statusCode: 409, errorCode: 'slot_taken' }),
      createApiLogFixture({ id: 1, statusCode: 418, errorCode: 'teapot_overflow' }),
    ])
    missingMessageKeys.add('apiKeys.logs.errorCodes.teapot_overflow')
    const wrapper = await mountPanel()
    const errors = wrapper.findAll('[data-test="api-log-error"]')

    expect(errors[0]!.text()).toBe('apiKeys.logs.errorCodes.slot_taken')
    expect(errors[1]!.text()).toBe('teapot_overflow')
  })

  it('filters by key and by status class, and starts again from the newest call', async () => {
    const wrapper = await mountPanel()

    await pick(wrapper, 'api-logs-key', '3')

    expect(listApiLogsServiceMock).toHaveBeenLastCalledWith(7, {
      apiKeyId: 3,
      statusClass: undefined,
      before: undefined,
    })

    await pick(wrapper, 'api-logs-status', '4xx')

    expect(listApiLogsServiceMock).toHaveBeenLastCalledWith(7, {
      apiKeyId: 3,
      statusClass: '4xx',
      before: undefined,
    })

    await pick(wrapper, 'api-logs-key', 'all')
    await pick(wrapper, 'api-logs-status', 'all')

    expect(listApiLogsServiceMock).toHaveBeenLastCalledWith(7, {
      apiKeyId: undefined,
      statusClass: undefined,
      before: undefined,
    })
  })

  it('offers the older calls only while the server gives a cursor, and appends them', async () => {
    respond([createApiLogFixture({ id: 20 })], 20)
    const wrapper = await mountPanel()

    expect(wrapper.find('[data-test="api-logs-older"]').exists()).toBe(true)

    respond([createApiLogFixture({ id: 10 })], null)
    await wrapper.get('[data-test="api-logs-older"]').trigger('click')
    await flushPromises()

    expect(listApiLogsServiceMock).toHaveBeenLastCalledWith(7, {
      apiKeyId: undefined,
      statusClass: undefined,
      before: 20,
    })
    expect(wrapper.findAll('[data-test="base-table-row"]')).toHaveLength(2)
    expect(wrapper.find('[data-test="api-logs-older"]').exists()).toBe(false)
  })

  it('keeps the calls already read when the older ones fail to load', async () => {
    respond([createApiLogFixture({ id: 20 })], 20)
    const wrapper = await mountPanel()

    mockApiKeyFailure(listApiLogsServiceMock, 'api_unreachable', 500)
    await wrapper.get('[data-test="api-logs-older"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="api-logs-more-error"]').text()).toBe(
      'apiKeys.errors.apiUnreachable'
    )
    expect(wrapper.findAll('[data-test="base-table-row"]')).toHaveLength(1)
    expect(wrapper.find('[data-test="api-logs-older"]').exists()).toBe(true)
  })

  it('ignores an answer that arrives after the filter changed', async () => {
    const first = createDeferred<ApiKeyApiResult<ApiLogsResponse>>()
    listApiLogsServiceMock.mockImplementationOnce(() => first.promise)
    const wrapper = mountWithFrontendMocks(ApiLogsPanel, { props: { companyId: 7, apiKeys } })

    await nextTick()
    respond([createApiLogFixture({ id: 2, route: '/fresh' })])
    await pick(wrapper, 'api-logs-key', '3')

    first.resolve({
      ok: true,
      status: 200,
      data: { logs: [createApiLogFixture({ id: 1, route: '/stale' })], nextBefore: null },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('/fresh')
    expect(wrapper.text()).not.toContain('/stale')
  })
})
