<template>
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
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import UiButton from '@/components/ui/UiButton.vue'

const router = useRouter()
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
</script>

<style scoped>
.top-actions { display: flex; align-items: center; gap: 10px; }
.divider-v { width: 1px; height: 24px; background: var(--border-ui); margin: 0 10px; }
</style>
