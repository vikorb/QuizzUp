<template>
  <NavbarFrame
    :with-sidebar="false"
    :show-burger="true"
    :sidebar-open="sidebarOpen"
    @toggle-sidebar="toggleSidebar"
  >
    <template #overlay>
      <div class="drawer" :class="{ 'drawer--open': sidebarOpen }" @keydown.esc="closeSidebar">
        <div class="drawer__backdrop" @click="closeSidebar" />
        <aside class="drawer__panel" role="dialog" aria-modal="true">
          <div class="drawer__head">
            <div class="drawer__title">{{ $t('navbar.menu') }}</div>
            <UiButton variant="icon" aria-label="Close menu" @click="closeSidebar">✕</UiButton>
          </div>

          <div class="drawer__body">
            <SideBar :show-actions="true" />
          </div>
        </aside>
      </div>
    </template>
  </NavbarFrame>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import NavbarFrame from '@/components/NavbarFrame.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { isAuthenticated } from '@/state/authState'
import SideBar from '@/views/navbar/SideBar.vue'

const props = defineProps<{
  sidebarOpen: boolean
}>()

const emit = defineEmits<{
  (event: 'update:sidebarOpen', value: boolean): void
}>()

const router = useRouter()

const sidebarOpen = computed({
  get: () => props.sidebarOpen,
  set: (value: boolean) => emit('update:sidebarOpen', value),
})

function openSidebar() {
  sidebarOpen.value = true
}

function closeSidebar() {
  sidebarOpen.value = false
}

function toggleSidebar() {
  sidebarOpen.value ? closeSidebar() : openSidebar()
}

router.afterEach(() => closeSidebar())
if (!isAuthenticated.value) closeSidebar()
</script>
<style scoped>
.drawer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 50;
}

.drawer--open {
  pointer-events: auto;
}

.drawer__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(3, 4, 11, 0.62);
  backdrop-filter: blur(6px);
  opacity: 0;
  transition: var(--tr);
}

.drawer--open .drawer__backdrop {
  opacity: 1;
}

.drawer__panel {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: min(320px, 86vw);
  background: rgba(13, 15, 30, 0.82);
  border-right: 1px solid var(--border-ui);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.05) inset,
    0 0 18px var(--glow-blue),
    0 0 26px var(--glow-pink);
  transform: translateX(-102%);
  transition: var(--tr);
  display: grid;
  grid-template-rows: auto 1fr;
}

.drawer--open .drawer__panel {
  transform: translateX(0);
}

.drawer__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 14px 10px;
  border-bottom: 1px solid var(--border-ui);
}

.drawer__title {
  font-weight: 900;
  color: var(--text-0);
}

.drawer__close:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: var(--border-hover);
  color: var(--text-0);
}

.drawer__body {
  overflow: auto;
  padding: 10px;
}
</style>
