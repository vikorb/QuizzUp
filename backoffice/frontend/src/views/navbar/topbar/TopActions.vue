<template>
  <div class="top-actions">
    <LanguageSwitcher />
    <div class="divider-v"></div>

    <UiButton v-if="isAuthenticated" variant="default" @click="handleLogout">
      {{ $t('home.logout') }}
    </UiButton>

    <UiButton v-else variant="primary" @click="goLogin">
      {{ $t('home.login') }}
    </UiButton>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { clearToken, getToken, logoutApi,TOKEN_KEY } from '@/utils/auth'

const router = useRouter()

const token = ref<string | null>(getToken())
const isAuthenticated = computed(() => Boolean(token.value))

function syncTokenFromStorage(): void {
  token.value = getToken()
}

function goLogin(): void {
  router.push('/login')
}

async function handleLogout(): Promise<void> {
  const tokenValue = token.value

  // UI instant
  clearToken()
  syncTokenFromStorage()

  // best-effort API logout
  if (tokenValue) await logoutApi(tokenValue)

  router.push('/login')
}

// ✅ après login (router.replace('/')), ça resync => bouton devient "Déconnexion" sans refresh
watch(
  () => router.currentRoute.value.fullPath,
  () => syncTokenFromStorage()
)

// multi-onglets
function onStorage(event: StorageEvent) {
  if (event.key === TOKEN_KEY) token.value = event.newValue
}

onMounted(() => {
  window.addEventListener('storage', onStorage)
  syncTokenFromStorage()
})

onBeforeUnmount(() => {
  window.removeEventListener('storage', onStorage)
})
</script>

<style scoped>
.top-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.divider-v {
  width: 1px;
  height: 24px;
  background: var(--border-ui);
  margin: 0 10px;
}
</style>
