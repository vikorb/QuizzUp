// Surface « console » : écrans réservés à l'éditeur (superadmin). Lue par le build
// `--mode console`, par `npm run dev` et par les tests (alias `@surface`, voir vite.config.ts).
// Les écrans sont chargés à la demande : le build centre ne lit jamais ce fichier.
import { mdiBriefcaseAccountOutline, mdiInboxArrowDownOutline } from '@mdi/js'
import type { RouteRecordRaw } from 'vue-router'

import type { NavItem } from '@/components/NavGroup.vue'

export const routes: RouteRecordRaw[] = [
  {
    path: 'clients',
    name: 'clients',
    component: () => import('@/views/ClientsView.vue'),
    meta: { requiresAuth: true, requiresSuperadmin: true },
  },
  {
    path: 'clients/create',
    name: 'clients-create',
    component: () => import('@/views/clients/CreateClientView.vue'),
    meta: { requiresAuth: true, requiresSuperadmin: true },
  },
  {
    path: 'demo-requests',
    name: 'demo-requests',
    component: () => import('@/views/DemoRequestsView.vue'),
    meta: { requiresAuth: true, requiresSuperadmin: true },
  },
]

export const navItems: NavItem[] = [
  {
    to: '/clients',
    icon: mdiBriefcaseAccountOutline,
    iconType: 'mdi',
    labelKey: 'navbar.clients',
  },
  {
    to: '/demo-requests',
    icon: mdiInboxArrowDownOutline,
    iconType: 'mdi',
    labelKey: 'demoRequests.nav',
  },
]
