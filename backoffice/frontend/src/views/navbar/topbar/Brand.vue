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

.logo {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, var(--accent-cyan), var(--accent-purple));
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 20px var(--glow-cyan);
  overflow: hidden;
}

.logo-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
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
