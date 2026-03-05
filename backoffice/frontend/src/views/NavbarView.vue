<template>
  <NavbarMobileLayout v-if="useMobileLayout" v-model:sidebar-open="isSidebarOpen" />
  <NavbarDesktopLayout v-else />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import NavbarDesktopLayout from '@/views/navbar/NavbarDesktopLayout.vue'
import NavbarMobileLayout from '@/views/navbar/NavbarMobileLayout.vue'

const isMobileNav = ref(false)
const isSidebarOpen = ref(false)
const useMobileLayout = computed(() => isMobileNav.value)

let mql: MediaQueryList | null = null
let onMqlChange: ((event: MediaQueryListEvent) => void) | null = null

onMounted(() => {
  mql = window.matchMedia('(max-width: 980px)')
  isMobileNav.value = mql.matches

  onMqlChange = (event: MediaQueryListEvent) => {
    isMobileNav.value = event.matches
  }

  mql.addEventListener('change', onMqlChange)
})

onBeforeUnmount(() => {
  if (mql && onMqlChange) mql.removeEventListener('change', onMqlChange)
})
</script>
