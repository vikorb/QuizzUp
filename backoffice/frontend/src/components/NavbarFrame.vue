<template>
  <div class="app-shell">
    <div class="bg-gradient-mesh" aria-hidden="true"></div>

    <TopBar
      v-if="showTopBar"
      :show-burger="showBurger"
      :sidebar-open="sidebarOpen"
      @toggle-sidebar="$emit('toggle-sidebar')"
    />

    <div
      class="main-layout"
      :class="{ 'main-layout--solo': !withSidebar, 'main-layout--rail': collapsed }"
    >
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
import { computed } from 'vue'

import UiCard from '@/components/ui/UiCard.vue'
import TopBar from '@/views/navbar/TopBar.vue'

const props = defineProps<{
  withSidebar: boolean
  showBurger?: boolean
  sidebarOpen?: boolean
  collapsed?: boolean
}>()

defineEmits<{
  (event: 'toggle-sidebar'): void
}>()

// La barre du haut ne sert que là où le menu latéral est absent : pages invitées
// (desktop non connecté) et mobile (burger). Sur desktop connecté, tout est
// consolidé dans le menu de gauche (marque en haut, compte en bas).
const showTopBar = computed(() => Boolean(props.showBurger) || !props.withSidebar)
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
    radial-gradient(60vw 60vw at 12% -8%, rgba(74, 99, 216, 0.18), transparent 60%),
    radial-gradient(52vw 52vw at 92% 6%, rgba(116, 88, 230, 0.15), transparent 60%);
}

/* Fine grille « console », estompée vers le bas (matière/profondeur). */
.bg-gradient-mesh::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(rgba(126, 118, 200, 0.05) 1px, transparent 1px) 0 0 / 46px 46px,
    linear-gradient(90deg, rgba(126, 118, 200, 0.05) 1px, transparent 1px) 0 0 / 46px 46px;
  -webkit-mask-image: radial-gradient(ellipse 100% 70% at 30% 0%, #000 35%, transparent 80%);
  mask-image: radial-gradient(ellipse 100% 70% at 30% 0%, #000 35%, transparent 80%);
}

.main-layout {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: var(--side-w) 1fr;
  gap: 16px;
  margin-top: 14px;
  overflow: hidden;
  transition: grid-template-columns 0.24s cubic-bezier(0.4, 0, 0.2, 1);
}

.main-layout--rail {
  grid-template-columns: var(--rail-w) 1fr;
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
  overflow-y: scroll;
  overflow-x: hidden;
  scrollbar-gutter: stable;
}

/* Sécurité : si le layout desktop est rendu très étroit pendant un resize,
   on évite une grille écrasée (le layout mobile prend le relais sous 768px). */
@media (max-width: 767px) {
  .main-layout:not(.main-layout--solo) {
    grid-template-columns: 1fr;
  }
}
</style>
