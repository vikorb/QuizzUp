<template>
  <div class="top-actions">
    <LanguageSwitcher variant="desktop" />
    <div class="divider-v"></div>
    <AuthButton variant="topbar" :login-key="'home.login'" :logout-key="'home.logout'" />
  </div>
</template>

<script setup lang="ts">
import AuthButton from '@/components/AuthButton.vue'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
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
