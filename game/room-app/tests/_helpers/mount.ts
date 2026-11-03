import { enableAutoUnmount, mount } from '@vue/test-utils'
import type { Component } from 'vue'
import { createMemoryHistory } from 'vue-router'

import { createAppI18n, setCurrentLocale } from '@/plugins/i18n'
import { createRoomRouter } from '@/router'

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
