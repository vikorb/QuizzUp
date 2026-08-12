<template>
  <nav
    class="sidebar"
    :class="{ 'sidebar--actions-only': !canShowNav, 'sidebar--rail': collapsed }"
  >
    <div v-if="!showActions" class="sidebar__brand">
      <RouterLink to="/" class="sidebar__logo" aria-label="Accueil">
        <img src="@/assets/img/logo.png" alt="" class="sidebar__logo-img" />
      </RouterLink>

      <span v-if="!collapsed" class="sidebar__brand-name">{{ $t('navbar.appTitle') }}</span>

      <button
        v-if="canShowNav"
        class="sidebar__collapse"
        type="button"
        :aria-label="collapsed ? $t('navbar.expandMenu') : $t('navbar.collapseMenu')"
        :title="collapsed ? $t('navbar.expandMenu') : $t('navbar.collapseMenu')"
        @click="$emit('toggle-collapsed')"
      >
        <MdIcon :path="mdiChevronLeft" :size="18" />
      </button>
    </div>

    <div v-if="canShowNav" class="sidebar__main">
      <NavGroup :label="$t('navbar.dashboard')" :items="navDashboard" :rail="collapsed" />
      <NavGroup :label="$t('navbar.manage')" :items="navManage" :rail="collapsed" />
      <NavGroup :label="$t('navbar.live')" :items="navPlay" :rail="collapsed" />
    </div>

    <SidebarActions v-if="(showActions || canShowNav) && !collapsed" class="sidebar__actions" />
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
import { RouterLink } from 'vue-router'

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
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding-top: 4px;
}

/* ---- Marque (logo + nom + repli) ---- */
.sidebar__brand {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 2px 6px 14px;
  flex: 0 0 auto;
}

.sidebar__logo {
  display: inline-flex;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
}
.sidebar__logo-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.sidebar__brand-name {
  font-size: 18px;
  font-weight: 800;
  color: var(--text-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar__collapse {
  margin-left: auto;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--border-ui);
  border-radius: 9px;
  background: var(--surface-1);
  color: var(--text-2);
  cursor: pointer;
  transition:
    color var(--tr),
    border-color var(--tr);
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
  padding-top: 0;
}

.sidebar--actions-only .sidebar__actions {
  flex: 1 1 auto;
  overflow: auto;
  min-height: 0;
}

/* ---- Rail (icônes seules, tablette portrait) ---- */
.sidebar--rail .sidebar__brand {
  flex-direction: column;
  gap: 12px;
  padding: 2px 0 12px;
}
.sidebar--rail .sidebar__collapse {
  margin: 0;
}
.sidebar--rail .sidebar__collapse :deep(svg) {
  transform: rotate(180deg);
}
</style>
