<template>
  <SectionLayout :title="$t('themes.title')" :subtitle="$t('themes.subtitle')">
    <ThemesToolbar
      v-model="searchQuery"
      v-model:status-filter="statusFilter"
      v-model:mode-filter="modeFilter"
      v-model:scope-filter="scopeFilter"
      :can-show-deleted-status="isSuperAdmin"
    />

    <BaseBanner
      :variant="actionBannerVariant"
      :message="actionBannerMessage"
      @dismiss="clearActionBanner"
    />

    <ThemesTable
      :themes="filteredThemes"
      :loading="loading"
      :error="error"
      @retry="loadPage"
      @open="goToDetail"
      @updated="handleThemeUpdated"
      @deleted="handleDeleted"
      @error="handleActionError"
    />
  </SectionLayout>
</template>

<script setup lang="ts">
import {
  ADMIN_ROLE_SUPERADMIN,
  THEME_STATUS_ACTIVE,
  THEME_STATUS_DELETED,
  THEME_STATUS_DRAFT,
  THEME_STATUS_INACTIVE,
} from '@quizzup/shared'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import SectionLayout from '@/components/SectionLayout.vue'
import BaseBanner from '@/components/ui/BaseBanner.vue'
import { listThemesService } from '@/services/themesService'
import { authState } from '@/state/authState'
import type { ActionBanner } from '@/types/banner'
import type { Theme } from '@/types/theme'
import {
  createErrorBanner,
  createSuccessBanner,
  getBannerMessage,
  getBannerVariant,
} from '@/utils/banner'

import ThemesTable from './themes/ThemesTable.vue'
import ThemesToolbar from './themes/ThemesToolbar.vue'

const { t } = useI18n()
const router = useRouter()

const themes = ref<Theme[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const actionBanner = ref<ActionBanner | null>(null)

const searchQuery = ref('')
const statusFilter = ref('')
const modeFilter = ref('')
const scopeFilter = ref('')

const isSuperAdmin = computed(
  () => authState.me.value?.role === ADMIN_ROLE_SUPERADMIN,
)

const actionBannerVariant = computed(() => getBannerVariant(actionBanner.value))
const actionBannerMessage = computed(() => getBannerMessage(actionBanner.value, t))

const filteredThemes = computed(() => {
  return themes.value.filter((theme) => {
    return (
      matchesSearch(theme) &&
      matchesStatus(theme) &&
      matchesMode(theme) &&
      matchesScope(theme)
    )
  })
})

function clearActionBanner(): void {
  actionBanner.value = null
}

function matchesSearch(theme: Theme): boolean {
  const search = searchQuery.value.trim().toLowerCase()

  if (!search) {
    return true
  }

  return [
    theme.name,
    theme.mode,
    theme.scope,
    getThemeStatusSearchLabel(theme.status),
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(search))
}

function matchesStatus(theme: Theme): boolean {
  if (!statusFilter.value) {
    return theme.status !== THEME_STATUS_DELETED
  }

  return String(theme.status) === statusFilter.value
}

function matchesMode(theme: Theme): boolean {
  if (!modeFilter.value) {
    return true
  }

  return theme.mode === modeFilter.value
}

function matchesScope(theme: Theme): boolean {
  if (!scopeFilter.value) {
    return true
  }

  return theme.scope === scopeFilter.value
}

function getThemeStatusSearchLabel(status: number): string {
  if (status === THEME_STATUS_ACTIVE) {
    return 'active'
  }

  if (status === THEME_STATUS_INACTIVE) {
    return 'inactive'
  }

  if (status === THEME_STATUS_DRAFT) {
    return 'draft'
  }

  return 'deleted'
}

function getThemeName(theme: Theme): string {
  return theme.name || `#${theme.id}`
}

async function loadPage(): Promise<void> {
  loading.value = true
  error.value = null
  clearActionBanner()

  try {
    const result = await listThemesService()

    if (!result.ok) {
      error.value = result.error
      return
    }

    themes.value = result.data.themes
  } catch {
    error.value = 'serverError'
    themes.value = []
  } finally {
    loading.value = false
  }
}

function goToDetail(themeId: number): void {
  void router.push({
    name: 'themes-edit',
    params: {
      themeId: String(themeId),
    },
  })
}

function handleThemeUpdated(updatedTheme: Theme): void {
  clearActionBanner()

  themes.value = themes.value.map((theme) =>
    theme.id === updatedTheme.id ? updatedTheme : theme,
  )

  actionBanner.value = createSuccessBanner('themeUpdated', {
    theme: getThemeName(updatedTheme),
  })
}

function handleDeleted(themeId: number): void {
  clearActionBanner()

  const deletedTheme = themes.value.find((theme) => theme.id === themeId)

  themes.value = themes.value.filter((theme) => theme.id !== themeId)

  actionBanner.value = createSuccessBanner('themeDeleted', {
    theme: deletedTheme?.name ?? `#${themeId}`,
  })
}

function handleActionError(errorCode: string): void {
  actionBanner.value = createErrorBanner(errorCode)
}

onMounted(loadPage)
</script>
