<template>
  <div class="top-actions">
    <LanguageSwitcher variant="desktop" />

    <div class="divider-v"></div>

    <RouterLink
      v-if="isAuthenticated"
      class="profile-link"
      :to="{ name: 'profile' }"
    >
      {{ $t('home.profile') }}
    </RouterLink>

    <AuthButton variant="topbar" :login-key="'home.login'" :logout-key="'home.logout'" />
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'

import AuthButton from '@/components/AuthButton.vue'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import { isAuthenticated } from '@/state/authState'
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

.profile-link {
  border: 1px solid var(--border-ui);
  border-radius: 999px;
  padding: 8px 14px;
  color: var(--text-primary);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 600;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    color 0.2s ease;
}

.profile-link:hover {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  color: var(--primary);
}
</style>
