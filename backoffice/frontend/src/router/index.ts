import { ADMIN_ROLE_ADMIN, ADMIN_ROLE_SUPERADMIN } from '@quizzup/shared'
import { createRouter } from 'vue-router'
import { createWebHistory } from 'vue-router'

import { isAuthenticated, me, refreshMe } from '@/state/authState'
import CreateAccountView from '@/views/clients/accounts/CreateAccountView.vue'
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

const getCurrentCompanyId = () => {
  return me.value?.companyId ?? me.value?.companyId ?? null
}

const getRouteCompanyId = (params: Record<string, unknown>) => {
  const rawCompanyId = params.companyId ?? params.id

  if (Array.isArray(rawCompanyId)) {
    return Number(rawCompanyId[0])
  }

  return Number(rawCompanyId)
}

const isSuperadmin = () => {
  return me.value?.role === ADMIN_ROLE_SUPERADMIN
}

const isCompanyAdmin = () => {
  return me.value?.role === ADMIN_ROLE_ADMIN
}

const canAccessCompany = (params: Record<string, unknown>) => {
  if (isSuperadmin()) {
    return true
  }

  const routeCompanyId = getRouteCompanyId(params)
  const currentCompanyId = Number(getCurrentCompanyId())

  return Number.isFinite(routeCompanyId) && Number.isFinite(currentCompanyId) && routeCompanyId === currentCompanyId
}

const canManageCompany = (params: Record<string, unknown>) => {
  if (isSuperadmin()) {
    return true
  }

  return isCompanyAdmin() && canAccessCompany(params)
}

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
          path: 'profil',
          name: 'profile',
          component: CreateAccountView,
          meta: { requiresAuth: true },
        },
        {
          path: 'clients',
          name: 'clients',
          component: ClientsView,
          meta: { requiresAuth: true, requiresSuperadmin: true },
        },
        {
          path: 'clients/create',
          name: 'clients-create',
          component: CreateClientView,
          meta: { requiresAuth: true, requiresSuperadmin: true },
        },
        {
          path: 'clients/:companyId/accounts/create',
          name: 'company-account-create',
          component: CreateAccountView,
          meta: { requiresAuth: true, requiresCompanyAdminAccess: true },
        },
        {
          path: 'clients/:companyId/accounts/:accountId/edit',
          name: 'company-account-edit',
          component: CreateAccountView,
          meta: { requiresAuth: true, requiresCompanyAdminAccess: true },
        },
        {
          path: 'clients/:id',
          name: 'client-details',
          component: ClientDetailsView,
          meta: { requiresAuth: true, requiresCompanyAccess: true },
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

  if (to.meta.requiresSuperadmin && !isSuperadmin()) {
    return { name: 'home' }
  }

  if (to.meta.requiresCompanyAccess && !canAccessCompany(to.params)) {
    return { name: 'home' }
  }

  if (to.meta.requiresCompanyAdminAccess && !canManageCompany(to.params)) {
    return { name: 'home' }
  }

  return true
})
