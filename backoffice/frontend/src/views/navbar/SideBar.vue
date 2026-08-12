<template>
  <nav
    class="sidebar"
    :class="{ 'sidebar--actions-only': !canShowNav, 'sidebar--rail': collapsed }"
  >
    <button
      v-if="canShowNav && !showActions"
      class="sidebar__collapse"
      type="button"
      :aria-label="collapsed ? $t('navbar.expandMenu') : $t('navbar.collapseMenu')"
      :title="collapsed ? $t('navbar.expandMenu') : $t('navbar.collapseMenu')"
      @click="$emit('toggle-collapsed')"
    >
      <MdIcon :path="mdiChevronLeft" :size="18" />
    </button>

    <div v-if="canShowNav" class="sidebar__main">
      <NavGroup :label="$t('navbar.dashboard')" :items="navDashboard" :rail="collapsed" />
      <NavGroup :label="$t('navbar.manage')" :items="navManage" :rail="collapsed" />
      <NavGroup :label="$t('navbar.live')" :items="navPlay" :rail="collapsed" />
    </div>

    <SidebarActions v-if="showActions" class="sidebar__actions" />
  </nav>
</template>

<script setup lang="ts">
import {
  mdiAccountGroupOutline,
  mdiBriefcaseAccountOutline,
  mdiChartTimelineVariant,
  mdiChevronLeft,
  mdiHelpCircleOutline,
  mdiHomeOutline,
  mdiPaletteOutline,
  mdiPlayCircleOutline,
} from '@mdi/js'
import { ADMIN_ROLE_SUPERADMIN } from '@quizzup/shared'
import { computed } from 'vue'

import NavGroup from '@/components/NavGroup.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import { isAuthenticated, me } from '@/state/authState'
import SidebarActions from '@/views/navbar/sidebar/SidebarActions.vue'

defineProps({
  showActions: { type: Boolean, default: false },
  collapsed: { type: Boolean, default: false },
})

defineEmits<{
  (event: 'toggle-collapsed'): void
}>()

const canShowNav = computed(() => isAuthenticated.value)

const isSuperadmin = computed(() => me.value?.role === ADMIN_ROLE_SUPERADMIN)

const currentCompanyId = computed(() => {
  return me.value?.companyId ?? me.value?.companyId ?? null
})

const navDashboard = [
  { to: '/', icon: mdiHomeOutline, iconType: 'mdi' as const, labelKey: 'navbar.home' },
]

const navManage = computed(() => {
  const base = [
    {
      to: '/players',
      icon: mdiAccountGroupOutline,
      iconType: 'mdi' as const,
      labelKey: 'navbar.players',
    },
    {
      to: '/themes',
      icon: mdiPaletteOutline,
      iconType: 'mdi' as const,
      labelKey: 'navbar.themes',
    },
    {
      to: '/questions',
      icon: mdiHelpCircleOutline,
      iconType: 'mdi' as const,
      labelKey: 'navbar.questionsAnswers',
    },
  ] as const

  if (isSuperadmin.value) {
    return [
      {
        to: '/clients',
        icon: mdiBriefcaseAccountOutline,
        iconType: 'mdi' as const,
        labelKey: 'navbar.clients',
      },
      ...base,
    ]
  }

  if (currentCompanyId.value) {
    return [
      {
        to: `/clients/${currentCompanyId.value}`,
        icon: mdiBriefcaseAccountOutline,
        iconType: 'mdi' as const,
        labelKey: 'navbar.myCompany',
      },
      ...base,
    ]
  }

  return [...base]
})

const navPlay = [
  { to: '/games', icon: mdiPlayCircleOutline, iconType: 'mdi' as const, labelKey: 'navbar.games' },
  {
    to: '/stats',
    icon: mdiChartTimelineVariant,
    iconType: 'mdi' as const,
    labelKey: 'navbar.statistics',
  },
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

.sidebar__collapse {
  align-self: flex-end;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  margin: 0 2px 6px;
  flex: 0 0 auto;
  border: 1px solid var(--border-ui);
  border-radius: 10px;
  background: var(--surface-1);
  color: var(--text-2);
  cursor: pointer;
  transition: var(--tr);
}
.sidebar__collapse:hover {
  color: var(--text-0);
  border-color: var(--border-hover);
}
.sidebar__collapse :deep(svg) {
  transition: transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar__main {
  flex: 1 1 auto;
  overflow: auto;
  overflow-x: hidden;
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

/* ---- Rail (icônes seules) ---- */
.sidebar--rail .sidebar__collapse {
  align-self: center;
  margin: 0 auto 8px;
}
.sidebar--rail .sidebar__collapse :deep(svg) {
  transform: rotate(180deg);
}
</style>
