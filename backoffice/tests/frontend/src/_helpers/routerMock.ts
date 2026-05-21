import { vi } from 'vitest'

type RouterAfterEachCallback = (...args: unknown[]) => unknown

export const pushMock = vi.fn()
export const replaceMock = vi.fn()
export const removeAfterEachMock = vi.fn()

export const currentRouteMock = {
  path: '/',
  name: 'home',
  fullPath: '/',
  params: {},
  query: {},
  meta: {},
  matched: [],
}

export const afterEachCallbacks: RouterAfterEachCallback[] = []

export const afterEachMock = vi.fn((callback: RouterAfterEachCallback) => {
  afterEachCallbacks.push(callback)

  return removeAfterEachMock
})

export const resolveMock = vi.fn((to: unknown) => {
  const href = toHref(to)

  return {
    href,
    fullPath: href,
    path: href,
    name: typeof to === 'object' && to && 'name' in to ? String(to.name) : undefined,
    params: {},
    query: {},
    meta: {},
    matched: [],
    redirectedFrom: undefined,
  }
})

export const routerMock = {
  push: pushMock,
  replace: replaceMock,
  afterEach: afterEachMock,
  resolve: resolveMock,
  currentRoute: {
    value: currentRouteMock,
  },
}

export function resetRouterMock(): void {
  pushMock.mockReset()
  replaceMock.mockReset()
  afterEachMock.mockClear()
  resolveMock.mockClear()
  removeAfterEachMock.mockClear()
  afterEachCallbacks.splice(0, afterEachCallbacks.length)

  currentRouteMock.path = '/'
  currentRouteMock.name = 'home'
  currentRouteMock.fullPath = '/'
  currentRouteMock.params = {}
  currentRouteMock.query = {}
  currentRouteMock.meta = {}
  currentRouteMock.matched = []
}

export async function triggerRouterAfterEach(): Promise<void> {
  for (const callback of [...afterEachCallbacks]) {
    await callback(currentRouteMock, currentRouteMock, undefined)
  }
}

export function toHref(to: unknown): string {
  if (typeof to === 'string') {
    return to
  }

  if (to && typeof to === 'object' && 'path' in to) {
    return String((to as { path: unknown }).path)
  }

  if (to && typeof to === 'object' && 'name' in to) {
    return String((to as { name: unknown }).name)
  }

  return '#'
}
