<template>
  <NavbarMobileLayout v-if="useMobileLayout" v-model:sidebar-open="isSidebarOpen" />
  <NavbarDesktopLayout v-else />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import NavbarDesktopLayout from '@/views/navbar/NavbarDesktopLayout.vue'
import NavbarMobileLayout from '@/views/navbar/NavbarMobileLayout.vue'

const NAVBAR_MOBILE_BREAKPOINT = 980

const isMobileNav = ref(false)
const isSidebarOpen = ref(false)

const useMobileLayout = computed(() => isMobileNav.value)

function updateNavbarLayout(): void {
  isMobileNav.value = window.innerWidth <= NAVBAR_MOBILE_BREAKPOINT

  if (!isMobileNav.value) {
    isSidebarOpen.value = false
  }
}

onMounted(() => {
  updateNavbarLayout()
  window.addEventListener('resize', updateNavbarLayout)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateNavbarLayout)
})
</script>
