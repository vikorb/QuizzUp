<template>
  <div class="app-shell">
    <div class="bg-gradient-mesh" aria-hidden="true"></div>

    <TopBar
      :show-burger="showBurger"
      :sidebar-open="sidebarOpen"
      @toggle-sidebar="$emit('toggle-sidebar')"
    />

    <div class="main-layout" :class="{ 'main-layout--solo': !withSidebar }">
      <slot name="sidebar" />

      <main class="viewport">
        <UiCard class="content-wrapper">
          <RouterView />
        </UiCard>
      </main>
    </div>

    <slot name="overlay" />
  </div>
</template>

<script setup lang="ts">
import UiCard from '@/components/ui/UiCard.vue'
import TopBar from '@/views/navbar/TopBar.vue'

defineProps<{
  withSidebar: boolean
  showBurger?: boolean
  sidebarOpen?: boolean
}>()

defineEmits<{
  (event: 'toggle-sidebar'): void
}>()
</script>

<style scoped>
.app-shell {
  height: 100vh;
  padding: 16px;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.bg-gradient-mesh {
  position: fixed;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(circle at 10% 10%, rgba(139, 92, 246, 0.15) 0%, transparent 40%),
    radial-gradient(circle at 90% 80%, rgba(0, 242, 255, 0.1) 0%, transparent 40%);
}

.main-layout {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 16px;
  margin-top: 14px;
  overflow: hidden;
}

.main-layout--solo {
  grid-template-columns: 1fr;
}

.viewport {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.content-wrapper {
  height: 100%;
  min-height: 0;
  padding: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

@media (max-width: 980px) {
  .main-layout {
    grid-template-columns: 1fr;
  }
}
</style>
