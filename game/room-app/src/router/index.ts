import { createRouter, createWebHistory, type Router, type RouteRecordRaw } from 'vue-router'

import { isRoomReady } from '@/state/roomAuth'

export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true },
  },
  { path: '/', name: 'launch', component: () => import('@/views/LaunchView.vue') },
  { path: '/lobby', name: 'lobby', component: () => import('@/views/LobbyView.vue') },
  { path: '/play', name: 'play', component: () => import('@/views/GameView.vue') },
  {
    path: '/hardware',
    name: 'hardware',
    component: () => import('@/views/hardware/HardwareView.vue'),
  },
  { path: '/setup', name: 'setup', component: () => import('@/views/SetupView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export function installGuards(router: Router): Router {
  router.beforeEach((to) => {
    if (!to.meta.public && !isRoomReady.value) {
      return { name: 'login' }
    }
    if (to.name === 'login' && isRoomReady.value) {
      return { name: 'launch' }
    }
    return true
  })
  return router
}

export function createRoomRouter(history = createWebHistory()): Router {
  return installGuards(createRouter({ history, routes }))
}
