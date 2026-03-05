<template>
  <nav class="sidebar" :class="{ 'sidebar--actions-only': !canShowNav }">
    <div v-if="canShowNav" class="sidebar__main">
      <NavGroup :label="$t('navbar.dashboard')" :items="navDashboard" />
      <NavGroup :label="$t('navbar.manage')" :items="navManage" />
      <NavGroup :label="$t('navbar.live')" :items="navPlay" />
    </div>

    <SidebarActions v-if="showActions" class="sidebar__actions" />
  </nav>
</template>

<script setup lang="ts">
import {
  mdiAccountGroupOutline,
  mdiChartTimelineVariant,
  mdiHelpCircleOutline,
  mdiHomeOutline,
  mdiPaletteOutline,
  mdiPlayCircleOutline,
} from '@mdi/js'
import { computed } from 'vue'

import NavGroup from '@/components/NavGroup.vue'
import { isAuthenticated } from '@/state/authState'
import SidebarActions from '@/views/navbar/sidebar/SidebarActions.vue'

defineProps({
  showActions: { type: Boolean, default: false },
})

const canShowNav = computed(() => isAuthenticated.value)

const navDashboard = [
  { to: '/', icon: mdiHomeOutline, iconType: 'mdi' as const, labelKey: 'navbar.home' },
]

const navManage = [
  { to: '/players', icon: mdiAccountGroupOutline, iconType: 'mdi' as const, labelKey: 'navbar.players' },
  { to: '/themes', icon: mdiPaletteOutline, iconType: 'mdi' as const, labelKey: 'navbar.themes' },
  { to: '/questions', icon: mdiHelpCircleOutline, iconType: 'mdi' as const, labelKey: 'navbar.questionsAnswers' },
]

const navPlay = [
  { to: '/games', icon: mdiPlayCircleOutline, iconType: 'mdi' as const, labelKey: 'navbar.games' },
  { to: '/stats', icon: mdiChartTimelineVariant, iconType: 'mdi' as const, labelKey: 'navbar.statistics' },
]
</script>

<style scoped>
.sidebar {
  width: 100%;
  margin-top: 10px;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.sidebar__main {
  flex: 1 1 auto;
  overflow: auto;
  min-height: 0;
}

.sidebar__actions {
  flex: 0 0 auto;
}

.sidebar--actions-only {
  margin-top: 0;
}

.sidebar--actions-only .sidebar__actions {
  flex: 1 1 auto;
  overflow: auto;
  min-height: 0;
}
</style>
