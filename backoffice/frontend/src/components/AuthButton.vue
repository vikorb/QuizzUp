<template>
  <UiButton
    class="auth-btn"
    :class="`auth-btn--${variant}`"
    :variant="isAuthenticated ? 'danger' : 'primary'"
    type="button"
    @click="handleClick"
  >
    {{ isAuthenticated ? $t(logoutKey) : $t(loginKey) }}
  </UiButton>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

import UiButton from '@/components/ui/UiButton.vue'
import { isAuthenticated, logout } from '@/state/authState'

const props = withDefaults(
  defineProps<{
    variant?: 'topbar' | 'sidebar'
    loginKey?: string
    logoutKey?: string
    redirect?: string
  }>(),
  {
    variant: 'topbar',
    loginKey: 'auth.login.title',
    logoutKey: 'auth.logout',
    redirect: '/login',
  }
)

const router = useRouter()

async function handleClick(): Promise<void> {
  if (isAuthenticated.value) {
    await logout()
    router.push(props.redirect)
    return
  }

  router.push(props.redirect)
}
</script>

<style scoped>
.auth-btn--sidebar {
  width: 100%;
  border-radius: 14px;
  padding: 12px 14px;
}

.auth-btn--topbar {
  width: auto;
}
</style>
