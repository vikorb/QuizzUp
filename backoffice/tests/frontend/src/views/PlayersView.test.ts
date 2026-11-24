import {
  setAuthenticatedAdmin,
  setAuthenticatedSuperadmin,
  setAuthenticatedUser,
} from '@frontend-tests/_helpers/authStateMock'
import { loadCompaniesServiceMock } from '@frontend-tests/_helpers/companiesServiceMock'
import { confirmMock, setConfirmResult } from '@frontend-tests/_helpers/confirmMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import {
  createPlayerFixture,
  erasePlayerServiceMock,
  exportPlayersServiceMock,
  listPlayersServiceMock,
  playersFixture,
  resetPlayersServiceMock,
  unsubscribePlayerServiceMock,
} from '@frontend-tests/_helpers/playersServiceMock'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { currentRouteMock, replaceMock } from '@frontend-tests/_helpers/routerMock'
import { PLAYER_LIST_DEFAULT_LIMIT } from '@quizzup/shared'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PlayersView from '@/views/PlayersView.vue'

vi.mock('@/services/playersService', async () => {
  const playersService = await import('@frontend-tests/_helpers/playersServiceMock')

  return playersService.playersServiceModuleMock
})

resetFrontendMocksBeforeEach()

beforeEach(() => {
  resetPlayersServiceMock()
})

afterEach(() => {
  vi.useRealTimers()
})

async function mountPlayersView(): Promise<VueWrapper> {
  const wrapper = mountWithFrontendMocks(PlayersView)

  await flushPromises()

  return wrapper
}

function rows(wrapper: VueWrapper) {
  return wrapper.findAll('[data-test="base-table-row"]')
}

function columnKeys(wrapper: VueWrapper): string[] {
  return wrapper
    .findAll('[data-test="base-table-header"]')
    .map((header) => header.attributes('data-column')!)
}

function lastQuery() {
  return listPlayersServiceMock.mock.lastCall?.[1]
}

function bannerText(wrapper: VueWrapper): string {
  return wrapper.find('[data-test="base-banner"]').text()
}

/** Tape dans la recherche puis laisse passer la pause avant l'envoi. */
async function typeSearch(wrapper: VueWrapper, value: string): Promise<void> {
  vi.useFakeTimers()
  await wrapper.get('input').setValue(value)
  await vi.advanceTimersByTimeAsync(300)
  vi.useRealTimers()
  await flushPromises()
}

describe('views/PlayersView.vue — liste', () => {
  it('loads the first page of the players of the company of the signed-in admin', async () => {
    setAuthenticatedAdmin({ companyId: 1 })

    await mountPlayersView()

    expect(listPlayersServiceMock).toHaveBeenCalledTimes(1)
    expect(listPlayersServiceMock).toHaveBeenCalledWith(1, {
      search: undefined,
      limit: PLAYER_LIST_DEFAULT_LIMIT,
      offset: 0,
    })
  })

  it('shows the loading state while the request is pending', async () => {
    setAuthenticatedAdmin({ companyId: 1 })
    listPlayersServiceMock.mockReturnValue(new Promise(() => {}))

    const wrapper = await mountPlayersView()

    expect(wrapper.get('[data-test="base-card"]').attributes('data-loading')).toBe('true')
  })

  it('shows the players, with a dash for a player without a played game', async () => {
    setAuthenticatedAdmin({ companyId: 1 })

    const wrapper = await mountPlayersView()
    const [first, second] = rows(wrapper)

    expect(rows(wrapper)).toHaveLength(2)
    expect(first!.text()).toContain('Léa')
    expect(first!.text()).toContain('lea@example.test')
    expect(first!.text()).toContain('1200')
    expect(second!.text()).toContain('Max')
    expect(second!.get('[data-test="base-table-cell-sessions"]').text()).toBe('0')
    expect(second!.get('[data-test="base-table-cell-lastPlayedAt"]').text()).toBe('—')
    expect(second!.get('[data-test="base-table-cell-bestScore"]').text()).toBe('—')
  })

  it('tells how many players have no address', async () => {
    setAuthenticatedAdmin({ companyId: 1 })

    const wrapper = await mountPlayersView()

    expect(wrapper.text()).toContain('players.anonymous')
  })

  it('shows the empty state, and the one of a search without result', async () => {
    setAuthenticatedAdmin({ companyId: 1 })
    listPlayersServiceMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { players: [], total: 0, anonymousPlayers: 0 },
    })

    const wrapper = await mountPlayersView()

    expect(wrapper.get('[data-test="base-card-empty"]').text()).toBe('players.table.empty')
    expect(wrapper.text()).not.toContain('players.anonymous')

    await typeSearch(wrapper, 'zoe')

    expect(wrapper.get('[data-test="base-card-empty"]').text()).toBe('players.table.emptySearch')
  })

  it('shows the error of the API with a retry button, and retries', async () => {
    setAuthenticatedAdmin({ companyId: 1 })
    listPlayersServiceMock.mockResolvedValueOnce({ ok: false, status: 403, error: 'forbidden' })

    const wrapper = await mountPlayersView()

    expect(wrapper.get('[data-test="base-card"]').attributes('data-error')).toBe('forbidden')
    expect(rows(wrapper)).toHaveLength(0)
    expect(wrapper.text()).not.toContain('players.anonymous')

    await wrapper.get('[data-test="base-card-actions"] button').trigger('click')
    await flushPromises()

    expect(listPlayersServiceMock).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[data-test="base-card"]').attributes('data-error')).toBe('')
    expect(rows(wrapper)).toHaveLength(2)
  })

  it('shows an error when the service throws', async () => {
    setAuthenticatedAdmin({ companyId: 1 })
    listPlayersServiceMock.mockRejectedValue(new Error('boom'))

    const wrapper = await mountPlayersView()

    expect(wrapper.get('[data-test="base-card"]').attributes('data-error')).toBe('server_error')
  })

  it('ignores an older answer that arrives after a newer request', async () => {
    setAuthenticatedAdmin({ companyId: 1 })
    let resolveFirst!: (value: unknown) => void
    listPlayersServiceMock.mockImplementationOnce(
      () => new Promise((resolve) => (resolveFirst = resolve)) as never
    )

    const wrapper = mountWithFrontendMocks(PlayersView)
    await flushPromises()

    await typeSearch(wrapper, 'max')
    resolveFirst({ ok: false, status: 500, error: 'server_error' })
    await flushPromises()

    expect(wrapper.get('[data-test="base-card"]').attributes('data-error')).toBe('')
    expect(rows(wrapper)).toHaveLength(2)
  })
})

describe('views/PlayersView.vue — recherche et pagination', () => {
  it('searches on the name after a pause, trimmed, from the first page', async () => {
    setAuthenticatedAdmin({ companyId: 1 })

    const wrapper = await mountPlayersView()

    vi.useFakeTimers()
    await wrapper.get('input').setValue('  le')
    await vi.advanceTimersByTimeAsync(299)

    expect(listPlayersServiceMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    vi.useRealTimers()
    await flushPromises()

    expect(listPlayersServiceMock).toHaveBeenCalledTimes(2)
    expect(lastQuery()).toMatchObject({ search: 'le', offset: 0 })
  })

  it('sends one request for a burst of keystrokes', async () => {
    setAuthenticatedAdmin({ companyId: 1 })

    const wrapper = await mountPlayersView()

    vi.useFakeTimers()
    await wrapper.get('input').setValue('l')
    await vi.advanceTimersByTimeAsync(100)
    await wrapper.get('input').setValue('le')
    await vi.advanceTimersByTimeAsync(100)
    await wrapper.get('input').setValue('lea')
    await vi.advanceTimersByTimeAsync(300)
    vi.useRealTimers()
    await flushPromises()

    expect(listPlayersServiceMock).toHaveBeenCalledTimes(2)
    expect(lastQuery()).toMatchObject({ search: 'lea' })
  })

  it('never sends a search longer than the limit of the server', async () => {
    setAuthenticatedAdmin({ companyId: 1 })

    const wrapper = await mountPlayersView()

    await typeSearch(wrapper, 'a'.repeat(150))

    expect(lastQuery()?.search).toHaveLength(100)
  })

  it('drops the pending search when the screen is left', async () => {
    setAuthenticatedAdmin({ companyId: 1 })

    const wrapper = await mountPlayersView()

    vi.useFakeTimers()
    await wrapper.get('input').setValue('lea')
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(300)

    expect(listPlayersServiceMock).toHaveBeenCalledTimes(1)
  })

  it('goes back to the first page when the search changes', async () => {
    setAuthenticatedAdmin({ companyId: 1 })
    listPlayersServiceMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { ...playersFixture, total: PLAYER_LIST_DEFAULT_LIMIT * 3 },
    })

    const wrapper = await mountPlayersView()

    await wrapper.get('[data-test="pagination-next"]').trigger('click')
    await flushPromises()

    expect(lastQuery()).toMatchObject({ offset: PLAYER_LIST_DEFAULT_LIMIT })

    await typeSearch(wrapper, 'lea')

    expect(lastQuery()).toMatchObject({ search: 'lea', offset: 0 })
  })
})

describe('views/PlayersView.vue — rôles', () => {
  it('shows an admin the addresses, the export and the actions', async () => {
    setAuthenticatedAdmin({ companyId: 1 })

    const wrapper = await mountPlayersView()

    expect(columnKeys(wrapper)).toContain('email')
    expect(columnKeys(wrapper)).toContain('actions')
    expect(wrapper.find('[data-test="players-export"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-test="player-erase"]')).toHaveLength(2)
  })

  it('shows a user neither address, nor export, nor action, and still lists the players', async () => {
    setAuthenticatedUser({ companyId: 1 })
    listPlayersServiceMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        ...playersFixture,
        players: playersFixture.players.map((player) => ({ ...player, email: null })),
      },
    })

    const wrapper = await mountPlayersView()

    expect(rows(wrapper)).toHaveLength(2)
    expect(columnKeys(wrapper)).not.toContain('email')
    expect(columnKeys(wrapper)).not.toContain('actions')
    expect(wrapper.find('[data-test="players-export"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="player-erase"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="player-unsubscribe"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('@')
  })

  it('does not offer the company selector to an admin', async () => {
    setAuthenticatedAdmin({ companyId: 1 })

    const wrapper = await mountPlayersView()

    expect(loadCompaniesServiceMock).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('players.filters.company')
  })

  it('lets a superadmin pick another company and reloads the list', async () => {
    setAuthenticatedSuperadmin({ companyId: 1 })

    const wrapper = await mountPlayersView()

    expect(loadCompaniesServiceMock).toHaveBeenCalledTimes(1)

    listPlayersServiceMock.mockClear()
    await wrapper.get('select').setValue('2')
    await flushPromises()

    expect(replaceMock).toHaveBeenCalledWith({ name: 'players', query: { companyId: '2' } })
    expect(listPlayersServiceMock).toHaveBeenCalledWith(2, expect.any(Object))
  })

  it('opens the company given in the URL for a superadmin', async () => {
    setAuthenticatedSuperadmin({ companyId: 1 })
    currentRouteMock.query = { companyId: '2' }

    await mountPlayersView()

    expect(listPlayersServiceMock).toHaveBeenCalledWith(2, expect.any(Object))
  })
})

describe('views/PlayersView.vue — actions', () => {
  it('names each row button after its player for screen readers', async () => {
    setAuthenticatedAdmin({ companyId: 1 })

    const wrapper = await mountPlayersView()
    const erase = wrapper.findAll('[data-test="player-erase"]')[0]!
    const unsubscribe = wrapper.findAll('[data-test="player-unsubscribe"]')[0]!

    // Le double de `$t` ne rend que la clé : l'attribut doit venir d'une clé qui prend le nom.
    expect(erase.attributes('aria-label')).toBe('players.actions.erase')
    expect(unsubscribe.attributes('aria-label')).toBe('players.actions.unsubscribe')
  })

  it('removes the offers of a player without asking, then reloads the list', async () => {
    setAuthenticatedAdmin({ companyId: 1 })

    const wrapper = await mountPlayersView()

    await wrapper.findAll('[data-test="player-unsubscribe"]')[0]!.trigger('click')
    await flushPromises()

    expect(confirmMock).not.toHaveBeenCalled()
    expect(unsubscribePlayerServiceMock).toHaveBeenCalledWith(1, 'lea@example.test')
    expect(listPlayersServiceMock).toHaveBeenCalledTimes(2)
    expect(bannerText(wrapper)).toContain('players.banners.unsubscribed')
  })

  it('disables the unsubscription of a player who already refuses the offers', async () => {
    setAuthenticatedAdmin({ companyId: 1 })

    const wrapper = await mountPlayersView()
    const second = wrapper.findAll('[data-test="player-unsubscribe"]')[1]!

    expect(second.attributes('disabled')).toBeDefined()
  })

  it('shows the error of a failed unsubscription', async () => {
    setAuthenticatedAdmin({ companyId: 1 })
    unsubscribePlayerServiceMock.mockResolvedValue({ ok: false, status: 403, error: 'forbidden' })

    const wrapper = await mountPlayersView()

    await wrapper.findAll('[data-test="player-unsubscribe"]')[0]!.trigger('click')
    await flushPromises()

    expect(bannerText(wrapper)).toContain('players.errors.forbidden')
  })

  it('asks for a confirmation that says the erasure is final, before erasing', async () => {
    setAuthenticatedAdmin({ companyId: 1 })

    const wrapper = await mountPlayersView()

    await wrapper.findAll('[data-test="player-erase"]')[0]!.trigger('click')
    await flushPromises()

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'danger', message: 'players.erase.message' })
    )
    expect(erasePlayerServiceMock).toHaveBeenCalledWith(1, 'lea@example.test')
    expect(bannerText(wrapper)).toContain('players.banners.erased')
    expect(listPlayersServiceMock).toHaveBeenCalledTimes(2)
  })

  it('erases nothing when the confirmation is refused', async () => {
    setAuthenticatedAdmin({ companyId: 1 })
    setConfirmResult(false)

    const wrapper = await mountPlayersView()

    await wrapper.findAll('[data-test="player-erase"]')[0]!.trigger('click')
    await flushPromises()

    expect(erasePlayerServiceMock).not.toHaveBeenCalled()
    expect(listPlayersServiceMock).toHaveBeenCalledTimes(1)
  })

  it('tells when the player is already gone, and reloads the list', async () => {
    setAuthenticatedAdmin({ companyId: 1 })
    erasePlayerServiceMock.mockResolvedValue({ ok: false, status: 404, error: 'player_not_found' })

    const wrapper = await mountPlayersView()

    await wrapper.findAll('[data-test="player-erase"]')[0]!.trigger('click')
    await flushPromises()

    expect(bannerText(wrapper)).toContain('players.errors.playerNotFound')
    expect(listPlayersServiceMock).toHaveBeenCalledTimes(2)
  })

  it('shows an error when an action throws', async () => {
    setAuthenticatedAdmin({ companyId: 1 })
    erasePlayerServiceMock.mockRejectedValue(new Error('boom'))

    const wrapper = await mountPlayersView()

    await wrapper.findAll('[data-test="player-erase"]')[0]!.trigger('click')
    await flushPromises()

    expect(bannerText(wrapper)).toContain('players.errors.serverError')
  })

  it('goes back to the last existing page when the erasure empties the page shown', async () => {
    setAuthenticatedAdmin({ companyId: 1 })
    const fullPage = Array.from({ length: PLAYER_LIST_DEFAULT_LIMIT }, (_item, index) =>
      createPlayerFixture({ email: `joueur${index}@example.test`, displayName: `Joueur ${index}` })
    )
    const lastPlayer = createPlayerFixture({
      email: 'dernier@example.test',
      displayName: 'Dernier',
    })
    const total = PLAYER_LIST_DEFAULT_LIMIT + 1

    // Deux pages : la seconde n'a qu'un joueur.
    listPlayersServiceMock.mockImplementation(async (_companyId, query) => ({
      ok: true,
      status: 200,
      data: {
        players: query?.offset === 0 ? fullPage : [lastPlayer],
        total,
        anonymousPlayers: 0,
      },
    }))

    const wrapper = await mountPlayersView()

    await wrapper.get('[data-test="pagination-next"]').trigger('click')
    await flushPromises()

    expect(lastQuery()).toMatchObject({ offset: PLAYER_LIST_DEFAULT_LIMIT })

    // Après l'effacement du dernier joueur, la seconde page est vide : il ne reste qu'une page.
    listPlayersServiceMock.mockImplementation(async (_companyId, query) => ({
      ok: true,
      status: 200,
      data: {
        players: query?.offset === 0 ? fullPage : [],
        total: PLAYER_LIST_DEFAULT_LIMIT,
        anonymousPlayers: 0,
      },
    }))

    await wrapper.get('[data-test="player-erase"]').trigger('click')
    await flushPromises()

    expect(lastQuery()).toMatchObject({ offset: 0 })
    expect(rows(wrapper)).toHaveLength(PLAYER_LIST_DEFAULT_LIMIT)
    expect(wrapper.get('[data-test="base-card"]').attributes('data-error')).toBe('')
  })

  it('falls back on the first page, empty, when the last player of the company is erased', async () => {
    setAuthenticatedAdmin({ companyId: 1 })
    listPlayersServiceMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { players: [], total: 0, anonymousPlayers: 0 },
    })
    listPlayersServiceMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        players: [createPlayerFixture()],
        total: PLAYER_LIST_DEFAULT_LIMIT + 1,
        anonymousPlayers: 0,
      },
    })

    const wrapper = await mountPlayersView()

    await wrapper.get('[data-test="pagination-next"]').trigger('click')
    await flushPromises()

    expect(lastQuery()).toMatchObject({ offset: 0 })
    expect(wrapper.get('[data-test="base-card-empty"]').text()).toBe('players.table.empty')
  })
})

describe('views/PlayersView.vue — export', () => {
  it('downloads the CSV of the offers as a file', async () => {
    setAuthenticatedAdmin({ companyId: 1 })
    const createObjectURL = vi.fn(() => 'blob:players')
    const revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))

    const wrapper = await mountPlayersView()

    await wrapper.get('[data-test="players-export"]').trigger('click')
    await flushPromises()

    expect(exportPlayersServiceMock).toHaveBeenCalledWith(1)
    expect(click).toHaveBeenCalledTimes(1)
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('joueurs-offres.csv')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:players')

    click.mockRestore()
    vi.unstubAllGlobals()
  })

  it('shows the error of a failed export and downloads nothing', async () => {
    setAuthenticatedAdmin({ companyId: 1 })
    exportPlayersServiceMock.mockResolvedValue({ ok: false, status: 403, error: 'forbidden' })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const wrapper = await mountPlayersView()

    await wrapper.get('[data-test="players-export"]').trigger('click')
    await flushPromises()

    expect(bannerText(wrapper)).toContain('players.errors.forbidden')
    expect(click).not.toHaveBeenCalled()

    click.mockRestore()
  })
})
