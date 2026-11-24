import { describe, expect, it } from 'vitest'

import { router } from '@/router'
import { navItems as centreNavItems, routes as centreRoutes } from '@/surface/centre'
import { navItems as consoleNavItems, routes as consoleRoutes } from '@/surface/console'

const CONSOLE_ONLY_ROUTES = ['clients', 'clients-create']

describe('surface/centre', () => {
  it('declares none of the screens reserved to the publisher console', () => {
    const names = centreRoutes.map((route) => route.name)

    for (const name of CONSOLE_ONLY_ROUTES) {
      expect(names).not.toContain(name)
    }
    expect(centreRoutes).toEqual([])
    expect(centreNavItems).toEqual([])
  })
})

describe('surface/console', () => {
  it('declares the clients screens, lazily loaded and reserved to the superadmin', () => {
    expect(consoleRoutes.map((route) => route.name)).toEqual(CONSOLE_ONLY_ROUTES)

    for (const route of consoleRoutes) {
      expect(route.meta).toMatchObject({ requiresAuth: true, requiresSuperadmin: true })
      expect(route.component).toBeTypeOf('function')
    }
    expect(consoleNavItems.map((item) => item.to)).toEqual(['/clients'])
  })

  it('is the surface seen by the tests: the router exposes its routes', () => {
    for (const name of CONSOLE_ONLY_ROUTES) {
      expect(router.hasRoute(name)).toBe(true)
    }
    expect(router.resolve('/clients/create').name).toBe('clients-create')
  })
})
