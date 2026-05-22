<template>
  <SectionLayout :title="title" :subtitle="subtitle">
    <BaseCard
      id="theme-info"
      :title="cardTitle"
      :neon="true"
      :no-hover="true"
      :loading="loading"
      :error="error"
      error-namespace="themes.errors"
      class="theme-details-card"
    >
      <template #actions>
        <UiButton variant="default" type="button" :disabled="loading" @click="goBack">
          {{ $t('themes.detail.actions.back') }}
        </UiButton>
      </template>

      <ThemeDetailForm
        v-if="!loading"
        :theme="theme"
        :mode="mode"
        :can-edit="canEditTheme"
        @saved="handleThemeSaved"
        @cancel="goBack"
        @error="error = $event"
      />
    </BaseCard>

    <ThemeDetailQuestionsSection
      v-if="mode === 'edit' && themeId !== null"
      :theme-id="themeId"
      :can-edit="canEditTheme"
    />
  </SectionLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import SectionLayout from '@/components/SectionLayout.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { loadThemeService } from '@/services/themesService'
import { authState } from '@/state/authState'
import type { Theme } from '@/types/theme'
import { canUpdateTheme } from '@/utils/theme/permissions'

import ThemeDetailForm from './detail/ThemeDetailForm.vue'
import ThemeDetailQuestionsSection from './detail/ThemeDetailQuestionsSection.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const theme = ref<Theme | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const themeId = computed(() => {
  const rawThemeId = route.params.themeId
  const value = Array.isArray(rawThemeId) ? rawThemeId[0] : rawThemeId
  const parsed = Number(value)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
})

const mode = computed(() => (themeId.value === null ? 'create' : 'edit'))

const currentRole = computed(() => authState.me.value?.role ?? null)

const canEditTheme = computed(() => {
  if (mode.value === 'create') {
    return true
  }

  return theme.value ? canUpdateTheme(theme.value, currentRole.value) : false
})

const title = computed(() =>
  mode.value === 'edit' ? t('themes.edit.title') : t('themes.create.title'),
)

const subtitle = computed(() =>
  mode.value === 'edit' ? t('themes.edit.subtitle') : t('themes.create.subtitle'),
)

const cardTitle = computed(() =>
  mode.value === 'edit' ? t('themes.edit.cardTitle') : t('themes.create.cardTitle'),
)

async function loadPage(): Promise<void> {
  if (mode.value === 'create') {
    return
  }

  if (themeId.value === null) {
    error.value = 'invalidParams'
    return
  }

  loading.value = true
  error.value = null

  try {
    const result = await loadThemeService(themeId.value)

    if (!result.ok) {
      error.value = result.error
      theme.value = null
      return
    }

    theme.value = result.data.theme
  } catch {
    error.value = 'serverError'
    theme.value = null
  } finally {
    loading.value = false
  }
}

function handleThemeSaved(savedTheme: Theme): void {
  theme.value = savedTheme

  if (mode.value === 'create') {
    goBack()
  }
}

function goBack(): void {
  void router.push({ name: 'themes' })
}

onMounted(loadPage)
</script>

<style scoped>
.theme-details-card {
  margin-bottom: 18px;
  scroll-margin-top: 90px;
}
</style>
