import { createRouter, createWebHistory } from 'vue-router'

import { isAuthenticated, me, refreshMe } from '@/state/authState'
import ClientsView from '@/views/ClientsView.vue'
import GamesView from '@/views/GamesView.vue'
import HomeView from '@/views/HomeView.vue'
import LoginView from '@/views/LoginView.vue'
import NavbarView from '@/views/NavbarView.vue'
import PlayersView from '@/views/PlayersView.vue'
import QuestionsView from '@/views/QuestionsView.vue'
import StatsView from '@/views/StatsView.vue'
import ThemesView from '@/views/ThemesView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: NavbarView,
      children: [
        { path: '', component: HomeView },
        { path: '/login', component: LoginView },

        {
          path: 'clients',
          component: ClientsView,
          meta: { requiresAuth: true, requiresAdmin: true },
        },

        { path: 'players', component: PlayersView, meta: { requiresAuth: true } },
        { path: 'themes', component: ThemesView, meta: { requiresAuth: true } },
        { path: 'questions', component: QuestionsView, meta: { requiresAuth: true } },
        { path: 'games', component: GamesView, meta: { requiresAuth: true } },
        { path: 'stats', component: StatsView, meta: { requiresAuth: true } },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const isPublic = to.path === '/' || to.path === '/login'
  if (isPublic) {
    if (to.path === '/login' && isAuthenticated.value) return { path: '/' }
    return true
  }

  if (!isAuthenticated.value) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (!me.value) {
    await refreshMe()
  }

  if (!isAuthenticated.value) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (to.meta.requiresAdmin && me.value?.role !== 'admin') {
    return { path: '/' }
  }

  return true
})
