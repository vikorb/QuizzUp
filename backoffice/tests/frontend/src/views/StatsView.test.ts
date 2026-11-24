import {
  setAuthenticatedAdmin,
  setAuthenticatedSuperadmin,
} from '@frontend-tests/_helpers/authStateMock'
import { loadCompaniesServiceMock } from '@frontend-tests/_helpers/companiesServiceMock'
import {
  listGameRoomsServiceMock,
  resetGamesServiceMock,
} from '@frontend-tests/_helpers/gamesServiceMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { currentRouteMock, replaceMock } from '@frontend-tests/_helpers/routerMock'
import {
  loadStatsServiceMock,
  resetStatsServiceMock,
  statsFixture,
} from '@frontend-tests/_helpers/statsServiceMock'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import StatsView from '@/views/StatsView.vue'

vi.mock('@/services/gamesService', async () => {
  const gamesService = await import('@frontend-tests/_helpers/gamesServiceMock')

  return gamesService.gamesServiceModuleMock
})

vi.mock('@/services/statsService', async () => {
  const statsService = await import('@frontend-tests/_helpers/statsServiceMock')

  return statsService.statsServiceModuleMock
})

resetFrontendMocksBeforeEach()

beforeEach(() => {
  resetGamesServiceMock()
  resetStatsServiceMock()
})

async function mountStatsView(): Promise<VueWrapper> {
  const wrapper = mountWithFrontendMocks(StatsView)

  await flushPromises()

  return wrapper
}

function findSelect(wrapper: VueWrapper, label: string) {
  const field = wrapper
    .findAll('[data-test="select-field"]')
    .find((candidate) => candidate.find('span').text() === label)

  if (!field) {
    throw new Error(`select ${label} not found`)
  }

  return field.find('select')
}

function findDateInput(wrapper: VueWrapper, label: string) {
  const field = wrapper
    .findAll('[data-test="form-field"]')
    .find((candidate) => candidate.get('[data-test="form-field-label"]').text() === label)

  if (!field) {
    throw new Error(`date field ${label} not found`)
  }

  return field.get('input')
}

function lastQuery() {
  return loadStatsServiceMock.mock.lastCall?.[1]
}

describe('views/StatsView.vue', () => {
  it('loads the statistics of the company of the signed-in admin with the browser time zone', async () => {
    setAuthenticatedAdmin({ companyId: 1 })

    await mountStatsView()

    expect(loadStatsServiceMock).toHaveBeenCalledTimes(1)
    expect(loadStatsServiceMock).toHaveBeenCalledWith(1, {
      roomId: undefined,
      from: undefined,
      to: undefined,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
  })

  it('shows the loading state while the request is pending', async () => {
    setAuthenticatedAdmin({ companyId: 1 })
    loadStatsServiceMock.mockReturnValue(new Promise(() => {}))

    const wrapper = await mountStatsView()

    expect(wrapper.get('[role="status"]').text()).toBe('stats.loading')
    expect(wrapper.text()).not.toContain('stats.empty')
  })

  it('shows the figures, the rooms and the busiest slots', async () => {
    setAuthenticatedAdmin({ companyId: 1 })

    const wrapper = await mountStatsView()
    const text = wrapper.text()

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(text).toContain('stats.bars.finished')
    expect(text).toContain('stats.bars.finished')
    expect(text).toContain('stats.bars.aborted')
    expect(text).toContain('stats.rooms.title')
    expect(text).toContain('Salle Néon')
    expect(text).toContain('Salle Laser')
    expect(text).toContain('stats.slots.title')
    expect(text).not.toContain('stats.slots.empty')
  })

  it('shows the empty state when no session ended in the period', async () => {
    setAuthenticatedAdmin({ companyId: 1 })
    loadStatsServiceMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        ...statsFixture,
        sessions: { ...statsFixture.sessions, finished: 0, aborted: 0, byRoom: [] },
        busiestSlots: [],
      },
    })

    const wrapper = await mountStatsView()

    expect(wrapper.text()).toContain('stats.empty')
    expect(wrapper.text()).not.toContain('stats.bars.finished')
  })

  it('shows the translated error with a retry button, and retries', async () => {
    setAuthenticatedAdmin({ companyId: 1 })
    loadStatsServiceMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: 'stats_period_invalid',
    })

    const wrapper = await mountStatsView()

    expect(wrapper.get('[role="alert"]').text()).toContain('stats.errors.statsPeriodInvalid')
    expect(wrapper.text()).not.toContain('stats.bars.finished')

    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()

    expect(loadStatsServiceMock).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('stats.bars.finished')
  })

  it('shows the forbidden message', async () => {
    setAuthenticatedAdmin({ companyId: 1 })
    loadStatsServiceMock.mockResolvedValue({ ok: false, status: 403, error: 'forbidden' })

    const wrapper = await mountStatsView()

    expect(wrapper.get('[role="alert"]').text()).toContain('stats.errors.forbidden')
  })

  it('shows an error when the service throws', async () => {
    setAuthenticatedAdmin({ companyId: 1 })
    loadStatsServiceMock.mockRejectedValue(new Error('boom'))

    const wrapper = await mountStatsView()

    expect(wrapper.get('[role="alert"]').text()).toContain('stats.errors.serverError')
  })

  it('reloads with the room chosen in the filter', async () => {
    setAuthenticatedAdmin({ companyId: 1 })

    const wrapper = await mountStatsView()

    await findSelect(wrapper, 'stats.filters.room').setValue('11')
    await flushPromises()

    expect(lastQuery()).toMatchObject({ roomId: 11 })
  })

  it('sends the chosen days as local day bounds, end exclusive', async () => {
    setAuthenticatedAdmin({ companyId: 1 })

    const wrapper = await mountStatsView()

    await findDateInput(wrapper, 'stats.filters.from').setValue('2026-11-05')
    await flushPromises()
    await findDateInput(wrapper, 'stats.filters.to').setValue('2026-11-07')
    await flushPromises()

    expect(lastQuery()).toMatchObject({
      from: new Date(2026, 10, 5).toISOString(),
      to: new Date(2026, 10, 8).toISOString(),
    })
    // Les dates sont choisies : la note sur la période par défaut disparaît.
    expect(wrapper.text()).not.toContain('stats.defaultPeriod')
  })

  it('tells the default period when no date is chosen', async () => {
    setAuthenticatedAdmin({ companyId: 1 })

    const wrapper = await mountStatsView()

    expect(wrapper.text()).toContain('stats.defaultPeriod')
  })

  it('keeps telling the default period while only the end date is chosen', async () => {
    setAuthenticatedAdmin({ companyId: 1 })

    const wrapper = await mountStatsView()

    await findDateInput(wrapper, 'stats.filters.to').setValue('2026-11-07')
    await flushPromises()

    expect(wrapper.text()).toContain('stats.defaultPeriod')

    await findDateInput(wrapper, 'stats.filters.from').setValue('2026-11-05')
    await flushPromises()

    expect(wrapper.text()).not.toContain('stats.defaultPeriod')
  })

  it('tells there is no time slot when sessions exist but none finished', async () => {
    setAuthenticatedAdmin({ companyId: 1 })
    loadStatsServiceMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        ...statsFixture,
        sessions: { ...statsFixture.sessions, finished: 0, aborted: 2 },
        busiestSlots: [],
      },
    })

    const wrapper = await mountStatsView()

    expect(wrapper.text()).toContain('stats.slots.title')
    expect(wrapper.text()).toContain('stats.slots.empty')
  })

  it('does not offer the company selector to an admin', async () => {
    setAuthenticatedAdmin({ companyId: 1 })

    const wrapper = await mountStatsView()

    expect(loadCompaniesServiceMock).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('stats.filters.company')
  })

  it('lets a superadmin pick another company, and reloads rooms and statistics', async () => {
    setAuthenticatedSuperadmin({ companyId: 1 })

    const wrapper = await mountStatsView()

    expect(loadCompaniesServiceMock).toHaveBeenCalledTimes(1)

    listGameRoomsServiceMock.mockClear()
    loadStatsServiceMock.mockClear()

    await findSelect(wrapper, 'stats.filters.company').setValue('2')
    await flushPromises()

    expect(replaceMock).toHaveBeenCalledWith({ name: 'stats', query: { companyId: '2' } })
    expect(listGameRoomsServiceMock).toHaveBeenCalledWith(2)
    expect(loadStatsServiceMock).toHaveBeenCalledWith(2, expect.any(Object))
  })

  it('opens the company given in the URL for a superadmin', async () => {
    setAuthenticatedSuperadmin({ companyId: 1 })
    currentRouteMock.query = { companyId: '2' }

    await mountStatsView()

    expect(loadStatsServiceMock).toHaveBeenCalledWith(2, expect.any(Object))
  })

  it('ignores an older answer that arrives after a newer request', async () => {
    setAuthenticatedAdmin({ companyId: 1 })
    let resolveFirst!: (value: unknown) => void
    loadStatsServiceMock.mockImplementationOnce(
      () => new Promise((resolve) => (resolveFirst = resolve)) as never
    )

    const wrapper = mountWithFrontendMocks(StatsView)
    await flushPromises()

    await findSelect(wrapper, 'stats.filters.room').setValue('11')
    await flushPromises()
    resolveFirst({
      ok: false,
      status: 500,
      error: 'server_error',
    })
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('stats.bars.finished')
  })
})
