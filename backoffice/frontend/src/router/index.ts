import { createRouter, createWebHistory } from 'vue-router'

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
        { path: 'clients', component: ClientsView },
        { path: 'players', component: PlayersView },
        { path: 'themes', component: ThemesView },
        { path: 'questions', component: QuestionsView },
        { path: 'games', component: GamesView },
        { path: 'stats', component: StatsView }
      ]
    }
  ]
})
