<template>
  <SectionLayout :title="$t('themes.title')" :subtitle="$t('themes.subtitle')">
    <StatBar :stats="stats" />

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
      :themes="themes"
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
import { ADMIN_ROLE_SUPERADMIN, THEME_STATUS_ACTIVE, THEME_STATUS_DRAFT } from '@quizzup/shared'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import SectionLayout from '@/components/SectionLayout.vue'
import BaseBanner from '@/components/ui/BaseBanner.vue'
import StatBar, { type Stat } from '@/components/ui/StatBar.vue'
import { listThemesService } from '@/services/themesService'
import { authState } from '@/state/authState'
import type { ActionBanner } from '@/types/banner'
import type { Theme, ThemeFilters } from '@/types/theme'
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

const isSuperAdmin = computed(() => authState.me.value?.role === ADMIN_ROLE_SUPERADMIN)

const ratioOf = (part: number, total: number): number => (total > 0 ? (part / total) * 100 : 0)

const stats = computed<Stat[]>(() => {
  const total = themes.value.length
  const active = themes.value.filter((theme) => theme.status === THEME_STATUS_ACTIVE).length
  const drafts = themes.value.filter((theme) => theme.status === THEME_STATUS_DRAFT).length
  const questions = themes.value.reduce(
    (sum, theme) => sum + Number((theme as Record<string, unknown>).questionsCount ?? 0),
    0
  )

  return [
    { label: t('themes.stats.total'), value: total },
    { label: t('themes.stats.active'), value: active, tone: 'ok', ratio: ratioOf(active, total) },
    { label: t('themes.stats.drafts'), value: drafts, tone: 'warn', ratio: ratioOf(drafts, total) },
    { label: t('themes.stats.questions'), value: questions, tone: 'accent' },
  ]
})

const actionBannerVariant = computed(() => getBannerVariant(actionBanner.value))
const actionBannerMessage = computed(() => getBannerMessage(actionBanner.value, t))

// Le filtrage est délégué au serveur (statut « Supprimé » inclus) : on transmet
// les filtres via la query-string plutôt que de dupliquer la logique côté client.
const filters = computed<ThemeFilters>(() => ({
  search: searchQuery.value.trim() || undefined,
  status: statusFilter.value || undefined,
  mode: modeFilter.value || undefined,
  scope: scopeFilter.value || undefined,
}))

function clearActionBanner(): void {
  actionBanner.value = null
}

function getThemeName(theme: Theme): string {
  return theme.name || `#${theme.id}`
}

async function loadPage(): Promise<void> {
  loading.value = true
  error.value = null
  clearActionBanner()

  try {
    const result = await listThemesService(filters.value)

    if (!result.ok) {
      error.value = result.error
      themes.value = []
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

  themes.value = themes.value.map((theme) => (theme.id === updatedTheme.id ? updatedTheme : theme))

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

watch(filters, () => {
  void loadPage()
})

onMounted(loadPage)
</script>
