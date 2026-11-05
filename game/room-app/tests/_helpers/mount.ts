import { enableAutoUnmount, mount } from '@vue/test-utils'
import type { Component } from 'vue'
import { createMemoryHistory } from 'vue-router'

import { createAppI18n, setCurrentLocale } from '@/plugins/i18n'
import { createRoomRouter, routes } from '@/router'

// Démonte après chaque test, même en échec : évite les écouteurs clavier orphelins.
enableAutoUnmount(afterEach)

/** Monte un composant avec l'i18n (fr) et le vrai router (historique mémoire). */
export async function mountWithApp(
  component: Component,
  options: { route?: string; props?: Record<string, unknown> } = {}
) {
  setCurrentLocale('fr')
  const router = createRoomRouter(createMemoryHistory())
  await router.push(options.route ?? '/')
  await router.isReady()

  const wrapper = mount(component, {
    props: options.props,
    attachTo: document.body,
    global: { plugins: [router, createAppI18n()] },
  })

  return { wrapper, router }
}

/** Charger tout l'arbre des écrans, machine saturée, peut dépasser les 10 s du hook par défaut. */
export const PRELOAD_TIMEOUT_MS = 60_000

/**
 * Charge à l'avance les écrans que le router importe à la demande. Leur première transformation
 * par Vite dépasse 1 s (délai de `vi.waitFor`) quand la machine est chargée : à appeler en
 * `beforeAll(preloadRoutes, PRELOAD_TIMEOUT_MS)` dans les tests qui attendent une navigation.
 */
export async function preloadRoutes(): Promise<void> {
  // Un SFC compilé est un objet : seul un import paresseux est une fonction.
  await Promise.all(
    routes.map((route) =>
      typeof route.component === 'function'
        ? (route.component as () => Promise<unknown>)()
        : undefined
    )
  )
}
