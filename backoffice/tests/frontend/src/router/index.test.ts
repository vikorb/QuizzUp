import { setAuthenticatedAdmin, setUnauthenticated } from '@frontend-tests/_helpers/authStateMock'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { describe, expect, it } from 'vitest'

import { router } from '@/router'
import { getEditGameRoute, getGameResultsRoute } from '@/router/games'

resetFrontendMocksBeforeEach()

describe('router: results sheet of a game', () => {
  it('builds the route of the sheet, with the company for the superadmin', () => {
    expect(router.resolve(getGameResultsRoute(4)).fullPath).toBe('/games/4/results')
    expect(router.resolve(getGameResultsRoute(4, { companyId: 7 })).fullPath).toBe(
      '/games/4/results?companyId=7'
    )
  })

  it('is declared outside the navigation layout, so nothing hides it on paper', () => {
    const resolved = router.resolve('/games/4/results')

    expect(resolved.name).toBe('games-results')
    expect(resolved.matched).toHaveLength(1)
  })

  it('sends a signed-out visitor to the login page, then back to the sheet', async () => {
    setUnauthenticated()

    await router.push('/games/4/results')

    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/games/4/results')
  })

  it('opens for a signed-in member of the staff', async () => {
    setAuthenticatedAdmin()

    await router.push('/games/4/results')

    expect(router.currentRoute.value.name).toBe('games-results')
  })
})

describe('router: edition of a scheduled session', () => {
  it('builds the route of the edition, with the company for the superadmin', () => {
    expect(router.resolve(getEditGameRoute(4)).fullPath).toBe('/games/4/edit')
    expect(router.resolve(getEditGameRoute(4, { companyId: 7 })).fullPath).toBe(
      '/games/4/edit?companyId=7'
    )
  })

  it('sends a signed-out visitor to the login page, then back to the edition', async () => {
    setUnauthenticated()

    await router.push('/games/4/edit')

    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/games/4/edit')
  })

  it('opens for a signed-in member of the staff, on the screen of the form', async () => {
    setAuthenticatedAdmin()

    await router.push('/games/4/edit')

    expect(router.currentRoute.value.name).toBe('games-edit')
    expect(router.currentRoute.value.params.gameId).toBe('4')
  })
})
