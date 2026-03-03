<template>
  <div class="app-shell">
    <div class="bg-gradient-mesh" aria-hidden="true"></div>

    <header class="topbar">
      <div class="brand">
        <div class="logo">Q</div>
        <div class="brand-info">
          <span class="app-name">Quizz<span>Galaxy</span></span>
          <span class="app-status">Backoffice Pro</span>
        </div>
      </div>

      <div class="top-actions">
        <LanguageSwitcher />
        <div class="divider-v"></div>
        <UiButton v-if="isAuthenticated" variant="default" @click="handleLogout">
          {{ $t('auth.logout') }}
        </UiButton>
        <UiButton v-else variant="primary" @click="goLogin">
          {{ $t('auth.login') }}
        </UiButton>
      </div>
    </header>

    <div class="main-layout">
      <nav class="sidebar">
        <div class="nav-group">
          <div class="nav-label">Dashboard</div>
          <RouterLink to="/" class="nav-link" active-class="is-active">
            <span class="icon">⌂</span> {{ $t('nav.home') }}
          </RouterLink>
        </div>

        <div class="nav-group">
          <div class="nav-label">{{ $t('nav.manage') }}</div>
          <RouterLink 
            v-for="item in navManage" 
            :key="item.to" 
            :to="item.to" 
            class="nav-link" 
            active-class="is-active"
          >
            <span class="icon">{{ item.icon }}</span> {{ $t(item.labelKey) }}
          </RouterLink>
        </div>

        <div class="nav-group">
          <div class="nav-label">Live</div>
          <RouterLink 
            v-for="item in navPlay" 
            :key="item.to" 
            :to="item.to" 
            class="nav-link" 
            active-class="is-active"
          >
            <span class="icon">{{ item.icon }}</span> {{ $t(item.labelKey) }}
          </RouterLink>
        </div>
      </nav>

      <main class="viewport">
        <UiCard class="content-wrapper">
          <RouterView />
        </UiCard>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

// Import des composants UI
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiCard from '@/components/ui/UiCard.vue'

const router = useRouter()

/* --- LOGIQUE D'AUTH --- */
const ACCESS_TOKEN_KEY = 'access_token'
const token = ref<string | null>(localStorage.getItem(ACCESS_TOKEN_KEY))

const isAuthenticated = computed(() => Boolean(token.value))

function setToken(value: string | null): void {
  token.value = value
  if (value) localStorage.setItem(ACCESS_TOKEN_KEY, value)
  else localStorage.removeItem(ACCESS_TOKEN_KEY)
}

function goLogin(): void {
  router.push('/login')
}

function handleLogout(): void {
  setToken(null)
  router.push('/login')
}

const navManage = [
  { to: '/players', icon: '👤', labelKey: 'nav.players' },
  { to: '/themes', icon: '🧩', labelKey: 'nav.themes' },
  { to: '/questions', icon: '❓', labelKey: 'nav.questionsAnswers' }
] as const

const navPlay = [
  { to: '/games', icon: '▶', labelKey: 'nav.games' },
  { to: '/stats', icon: '⟠', labelKey: 'nav.statistics' }
] as const
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  padding: 20px;
  position: relative;
}

.bg-gradient-mesh {
  position: fixed;
  inset: 0;
  z-index: -1;
  background: 
    radial-gradient(circle at 10% 10%, rgba(139, 92, 246, 0.15) 0%, transparent 40%),
    radial-gradient(circle at 90% 80%, rgba(0, 242, 255, 0.1) 0%, transparent 40%);
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: var(--bg-card);
  border: 1px solid var(--border-ui);
  border-radius: 16px;
  backdrop-filter: blur(10px);
}

.brand { display: flex; align-items: center; gap: 15px; }

.logo {
  width: 40px; height: 40px;
  background: linear-gradient(135deg, var(--accent-cyan), var(--accent-purple));
  border-radius: 10px;
  display: grid; place-items: center;
  font-weight: 900;
  color: white;
  box-shadow: 0 0 20px var(--glow-cyan);
}

.app-name { font-weight: 800; font-size: 18px; display: block; }
.app-name span { color: var(--accent-cyan); }
.app-status { font-size: 11px; color: var(--text-2); text-transform: uppercase; }

.top-actions { display: flex; align-items: center; gap: 10px; }

.main-layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 20px;
  margin-top: 20px;
}

.nav-group { margin-bottom: 24px; }
.nav-label { 
  font-size: 11px; color: var(--text-3); 
  text-transform: uppercase; letter-spacing: 1px;
  margin-bottom: 8px; padding-left: 12px;
}

.nav-link {
  display: flex; align-items: center; gap: 12px;
  padding: 12px; border-radius: 12px;
  color: var(--text-1); text-decoration: none;
  transition: var(--tr);
}

.nav-link:hover { background: rgba(255,255,255,0.05); color: var(--text-0); }
.nav-link.is-active {
  background: rgba(139, 92, 246, 0.1);
  color: var(--accent-cyan);
}

.viewport { min-width: 0; }
.content-wrapper { min-height: calc(100vh - 160px); padding: 30px; }

.divider-v { width: 1px; height: 24px; background: var(--border-ui); margin: 0 10px; }
</style>
