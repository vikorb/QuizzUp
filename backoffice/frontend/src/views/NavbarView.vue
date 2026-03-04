<template>
  <div class="app-shell">
    <div class="bg-gradient-mesh" aria-hidden="true"></div>

    <TopBar>
      <template #auth-actions>
        <UiButton v-if="isAuthenticated" variant="default" @click="handleLogout">
          {{ $t('navbar.logout') }}
        </UiButton>
        <UiButton v-else variant="primary" @click="goLogin">
          {{ $t('navbar.login') }}
        </UiButton>
      </template>
    </TopBar>

    <div class="main-layout">
      <SideBar />

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

import UiButton from '@/components/ui/UiButton.vue'
import UiCard from '@/components/ui/UiCard.vue'

import SideBar from './navbar/SideBar.vue'
import TopBar from './navbar/TopBar.vue'

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

const goLogin = () => router.push('/login')
const handleLogout = () => { setToken(null); goLogin(); }
</script>

<style scoped>
.app-shell { min-height: 100vh; padding: 20px; position: relative; }

.bg-gradient-mesh {
  position: fixed; inset: 0; z-index: -1;
  background: 
    radial-gradient(circle at 10% 10%, rgba(139, 92, 246, 0.15) 0%, transparent 40%),
    radial-gradient(circle at 90% 80%, rgba(0, 242, 255, 0.1) 0%, transparent 40%);
}

.main-layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 20px;
  margin-top: 20px;
}

.viewport { min-width: 0; }
.content-wrapper { min-height: calc(100vh - 160px); padding: 30px; }
</style>
