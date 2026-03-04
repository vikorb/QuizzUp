<template>
  <header class="topbar">
    <Brand />
    <TopActions />
  </header>
</template>

<script setup lang="ts">
import Brand from '@/views/navbar/topbar/Brand.vue';

import TopActions from './topbar/TopActions.vue';
</script>

<style scoped>
.topbar {
  position: sticky;
  top: 12px;
  z-index: 50;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  gap: 16px;
  background:
    radial-gradient(900px 160px at 15% 0%, rgba(0, 98, 255, 0.20), transparent 62%),
    radial-gradient(900px 160px at 85% 0%, rgba(237, 46, 251, 0.20), transparent 62%),
    var(--bg-card);
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 18px;
  backdrop-filter: blur(14px);
  box-shadow:
    0 12px 34px rgba(0, 0, 0, 0.32),
    0 0 14px rgba(0, 98, 255, 0.16),
    0 0 18px rgba(237, 46, 251, 0.14),
    0 0 0 1px rgba(255, 255, 255, 0.03) inset;
  overflow: hidden;
}

.topbar > :deep(*) {
  position: relative;
  z-index: 1;
}

@media (max-width: 720px) {
  .topbar {
    top: 8px;
    padding: 12px 12px;
    border-radius: 16px;
  }
}
</style>
