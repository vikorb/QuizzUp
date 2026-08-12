<template>
  <NavbarFrame :with-sidebar="canShowSidebar" :collapsed="canShowSidebar && isRail">
    <template v-if="canShowSidebar" #sidebar>
      <SideBar class="sidebar" :collapsed="isRail" @toggle-collapsed="toggleRail" />
    </template>
  </NavbarFrame>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import NavbarFrame from '@/components/NavbarFrame.vue'
import { isAuthenticated } from '@/state/authState'
import SideBar from '@/views/navbar/SideBar.vue'

// Sous cette largeur (tablette portrait, cf. Material 3 « medium »), le menu
// passe automatiquement en rail d'icônes ; au-dessus il reste complet.
const RAIL_MAX_WIDTH = 1024

const canShowSidebar = computed(() => isAuthenticated.value)

const isRail = ref(false)
// null = automatique (piloté par la largeur) ; true/false = choix manuel de l'utilisateur.
let manualCollapsed: boolean | null = null

function applyRail(): void {
  if (window.innerWidth <= RAIL_MAX_WIDTH) {
    // Tablette portrait : toujours en rail, on oublie un éventuel choix manuel.
    isRail.value = true
    manualCollapsed = null
  } else {
    // Desktop / paysage : complet par défaut, sauf si l'utilisateur a replié.
    isRail.value = manualCollapsed === true
  }
}

function toggleRail(): void {
  manualCollapsed = !isRail.value
  isRail.value = manualCollapsed
}

onMounted(() => {
  applyRail()
  window.addEventListener('resize', applyRail)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', applyRail)
})
</script>

<style scoped>
.sidebar {
  min-height: 0;
  overflow: auto;
}
</style>
