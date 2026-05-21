import { type ComponentMountingOptions, mount, type VueWrapper } from '@vue/test-utils'
import type { Component } from 'vue'
import { routeLocationKey, routerKey } from 'vue-router'

import { currentRouteMock, routerMock } from './routerMock'
import { frontendStubs } from './vueStubs'

type MountOptions = ComponentMountingOptions<Component>

export function tMock(key: string): string {
  return key
}

export function mountWithFrontendMocks(
  component: Component,
  options: MountOptions = {},
): VueWrapper {
  return mount(component, {
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
