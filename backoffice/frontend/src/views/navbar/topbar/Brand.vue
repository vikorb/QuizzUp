<template>
  <RouterLink to="/" class="brand" aria-label="Home">
    <div class="logo">
      <img src="@/assets/img/logo.png" alt="Logo" class="logo-img" />
    </div>
    <div class="brand-info">
      <span class="app-name">{{ $t('navbar.appTitle') }}</span>
      <span class="app-status">{{ $t('navbar.subtitle') }}</span>
    </div>
  </RouterLink>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<style scoped>
.brand {
  display: flex;
  align-items: center;
  gap: 15px;
  text-decoration: none;
  color: inherit;
}

.brand:focus-visible {
  outline: 2px solid var(--border-hover);
  outline-offset: 4px;
  border-radius: 12px;
}

.app-name {
  font-weight: 800;
  font-size: 18px;
  display: block;
}

.app-status {
  font-size: 11px;
  color: var(--text-2);
  text-transform: uppercase;
}
</style>
