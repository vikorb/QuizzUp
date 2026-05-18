<template>
  <header class="topbar">
    <div class="left">
      <UiButton
        v-if="showBurger"
        class="burger"
        variant="icon"
        type="button"
        :aria-label="$t('navbar.menu')"
        @click="$emit('toggle-sidebar')"
      >
        <MdIcon :path="mdiMenu" :size="18" />
      </UiButton>

      <Brand />
    </div>

    <TopActions v-if="!showBurger" />
  </header>
</template>

<script setup lang="ts">
import { mdiMenu } from '@mdi/js'

import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import Brand from '@/views/navbar/topbar/Brand.vue'
import TopActions from '@/views/navbar/topbar/TopActions.vue'

defineProps<{
  showBurger?: boolean
  sidebarOpen?: boolean
}>()

defineEmits<{
  (e: 'toggle-sidebar'): void
}>()
</script>

<style scoped>.topbar {
  position: sticky;
  top: 12px;
  z-index: 50;

  flex: 0 0 auto;
  width: 100%;
  min-height: 72px;
  height: 72px;

  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  gap: 16px;

  background:
    radial-gradient(900px 160px at 15% 0%, rgba(0, 98, 255, 0.2), transparent 62%),
    radial-gradient(900px 160px at 85% 0%, rgba(237, 46, 251, 0.2), transparent 62%),
    var(--bg-card);

  border: 1px solid rgba(255, 255, 255, 0.1);
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

.left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1 1 auto;
}

.burger {
  flex: 0 0 auto;
}

.topbar :deep(.top-actions) {
  flex: 0 0 auto;
}

.topbar :deep(.brand) {
  min-width: 0;
}

.topbar :deep(.brand-text) {
  min-width: 0;
  overflow: hidden;
}

.topbar :deep(.app-title),
.topbar :deep(.app-subtitle) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .topbar {
    top: 8px;
    min-height: 64px;
    height: 64px;
    padding: 12px;
    border-radius: 16px;
  }
}
</style>
