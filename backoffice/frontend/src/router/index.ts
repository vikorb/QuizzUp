import { createRouter, createWebHistory } from 'vue-router'

import { isAuthenticated, me, refreshMe } from '@/state/authState'
import ClientDetailsView from '@/views/clients/ClientDetailsView.vue'
import CreateClientView from '@/views/clients/CreateClientView.vue'
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
        {
          path: '',
          name: 'home',
          component: HomeView,
        },
        {
          path: 'login',
          name: 'login',
          component: LoginView,
        },
        {
          path: 'clients',
          name: 'clients',
          component: ClientsView,
          meta: { requiresAuth: true, requiresAdmin: true },
        },
        {
          path: 'clients/create',
          name: 'clients-create',
          component: CreateClientView,
          meta: { requiresAuth: true, requiresAdmin: true },
        },
        {
          path: 'clients/:id',
          name: 'client-details',
          component: ClientDetailsView,
          meta: { requiresAuth: true, requiresAdmin: true },
        },

        {
          path: 'players',
          name: 'players',
          component: PlayersView,
          meta: { requiresAuth: true },
        },
        {
          path: 'themes',
          name: 'themes',
          component: ThemesView,
          meta: { requiresAuth: true },
        },
        {
          path: 'questions',
          name: 'questions',
          component: QuestionsView,
          meta: { requiresAuth: true },
        },
        {
          path: 'games',
          name: 'games',
          component: GamesView,
          meta: { requiresAuth: true },
        },
        {
          path: 'stats',
          name: 'stats',
          component: StatsView,
          meta: { requiresAuth: true },
        },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const isPublic = to.name === 'home' || to.name === 'login'

  if (isPublic) {
    if (to.name === 'login' && isAuthenticated.value) {
      return { name: 'home' }
    }

    return true
  }

  if (!isAuthenticated.value) {
    return {
      name: 'login',
      query: { redirect: to.fullPath },
    }
  }

  if (!me.value) {
    await refreshMe()
  }

  if (!isAuthenticated.value) {
    return {
      name: 'login',
      query: { redirect: to.fullPath },
    }
  }

  if (to.meta.requiresAdmin && me.value?.role !== 'admin') {
    return { name: 'home' }
  }

  return true
})
