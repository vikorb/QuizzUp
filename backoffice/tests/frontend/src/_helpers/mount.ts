import { type ComponentMountingOptions, mount, type VueWrapper } from '@vue/test-utils'
import type { Component } from 'vue'
import { routeLocationKey, routerKey } from 'vue-router'

import { currentRouteMock, routerMock } from './routerMock'
import { frontendStubs } from './vueStubs'

type MountOptions = ComponentMountingOptions<Component>

export function tMock(key: string): string {
  return key
}

// vue-tsc peut buter sur une « excessive stack depth » en comparant le DefineComponent<…>
// d'un .vue au type Component (composants au typage lourd : navbar → LanguageSwitcher →
// vue-i18n), ce qui casse le type-check de façon non déterministe. On élargit le paramètre
// pour éviter la comparaison structurelle profonde, puis on recast en Component pour mount().
export function mountWithFrontendMocks(
  component: Component | Record<string, unknown>,
  options: MountOptions = {}
): VueWrapper {
  return mount(component as Component, {
    ...options,
    global: {
      ...(options.global ?? {}),
      mocks: {
        $t: tMock,
        ...(options.global?.mocks ?? {}),
      },
      provide: {
        [routerKey as symbol]: routerMock,
        [routeLocationKey as symbol]: currentRouteMock,
        ...(options.global?.provide ?? {}),
      },
      stubs: {
        ...frontendStubs,
        ...(options.global?.stubs ?? {}),
      },
    },
  })
}
