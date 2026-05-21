<template>
  <BaseToolBar
    :reset-label="$t('resetFilters')"
    :reset-icon="mdiRefresh"
    :reset-disabled="!hasActiveFilters"
    :primary-label="$t('questions.table.create')"
    :primary-icon="mdiPlus"
    :show-primary="true"
    @reset="resetFilters"
    @primary="handleCreateQuestion"
  >
    <div class="questions-toolbar__filters">
      <FormField
        id="questions-search"
        class="search-field"
        :model-value="modelValue"
        :label="$t('questions.filters.search')"
        :placeholder="$t('questions.filters.searchPlaceholder')"
        inputmode="search"
        autocomplete="off"
        :neon="false"
        @update:model-value="$emit('update:modelValue', $event)"
      />

      <SelectField
        id="questions-theme-filter"
        :model-value="themeFilter"
        :label="$t('questions.filters.theme')"
        :options="themeOptions"
        @update:model-value="$emit('update:themeFilter', $event)"
      />

      <SelectField
        id="questions-status-filter"
        :model-value="statusFilter"
        :label="$t('questions.filters.status')"
        :options="statusOptions"
        @update:model-value="$emit('update:statusFilter', $event)"
      />

      <SelectField
        id="questions-type-media-filter"
        :model-value="typeMediaFilter"
        :label="$t('questions.filters.typeMedia')"
        :options="typeMediaOptions"
        @update:model-value="$emit('update:typeMediaFilter', $event)"
      />

      <SelectField
        id="questions-scope-filter"
        :model-value="scopeFilter"
        :label="$t('questions.filters.scope')"
        :options="scopeOptions"
        @update:model-value="$emit('update:scopeFilter', $event)"
      />
    </div>
  </BaseToolBar>
</template>

<script setup lang="ts">
import { mdiPlus, mdiRefresh } from '@mdi/js'
import {
  QUESTION_STATUS_ACTIVE,
  QUESTION_STATUS_DRAFT,
  QUESTION_STATUS_INACTIVE,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
} from '@quizzup/shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import BaseToolBar from '@/components/ui/BaseToolBar.vue'
import FormField from '@/components/ui/form/FormField.vue'
import SelectField from '@/components/ui/form/SelectField.vue'
import type { SelectFieldOption } from '@/types/form'
import type { Theme } from '@/types/question'

const props = withDefaults(
  defineProps<{
    modelValue: string
    themes: Theme[]
    themeFilter?: string
    statusFilter?: string
    typeMediaFilter?: string
    scopeFilter?: string
  }>(),
  {
    themeFilter: '',
    statusFilter: '',
    typeMediaFilter: '',
    scopeFilter: '',
  },
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'update:themeFilter', value: string): void
  (event: 'update:statusFilter', value: string): void
  (event: 'update:typeMediaFilter', value: string): void
  (event: 'update:scopeFilter', value: string): void
}>()

const router = useRouter()
const { t } = useI18n()

const hasActiveFilters = computed(
  () =>
    props.modelValue.trim() !== '' ||
    props.themeFilter !== '' ||
    props.statusFilter !== '' ||
    props.typeMediaFilter !== '' ||
    props.scopeFilter !== '',
)

const themeOptions = computed<SelectFieldOption[]>(() => [
  {
    label: t('questions.filters.allThemes'),
    value: '',
  },
  ...props.themes.map((theme) => ({
    label: theme.name,
    value: String(theme.id),
  })),
])

const statusOptions = computed<SelectFieldOption[]>(() => [
  {
    label: t('questions.filters.allStatuses'),
    value: '',
  },
  {
    label: t('questions.status.active'),
    value: String(QUESTION_STATUS_ACTIVE),
  },
  {
    label: t('questions.status.inactive'),
    value: String(QUESTION_STATUS_INACTIVE),
  },
  {
    label: t('questions.status.draft'),
    value: String(QUESTION_STATUS_DRAFT),
  },
])

const typeMediaOptions = computed<SelectFieldOption[]>(() => [
  {
    label: t('questions.filters.allTypes'),
    value: '',
  },
  {
    label: t('questions.media.none'),
    value: 'none',
  },
  {
    label: t('questions.media.image'),
    value: 'image',
  },
  {
    label: t('questions.media.audio'),
    value: 'audio',
  },
  {
    label: t('questions.media.video'),
    value: 'video',
  },
])

const scopeOptions = computed<SelectFieldOption[]>(() => [
  {
    label: t('questions.filters.allScopes'),
    value: '',
  },
  {
    label: t('questions.scope.global'),
    value: THEME_SCOPE_GLOBAL,
  },
  {
    label: t('questions.scope.company'),
    value: THEME_SCOPE_COMPANY,
  },
])

function resetFilters(): void {
  emit('update:modelValue', '')
  emit('update:themeFilter', '')
  emit('update:statusFilter', '')
  emit('update:typeMediaFilter', '')
  emit('update:scopeFilter', '')
}

function handleCreateQuestion(): void {
  void router.push({ name: 'questions-create' })
}
</script>

<style scoped>
.questions-toolbar__filters {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 190px 170px 170px 170px;
  align-items: end;
  gap: 12px;
}

.questions-toolbar__filters :deep(select),
.questions-toolbar__filters :deep(.select-field__trigger) {
  box-sizing: border-box;
  height: 46px;
  min-height: 46px;
}

.questions-toolbar__filters :deep(.search-field input) {
  box-sizing: border-box;
  height: 24px;
  min-height: 24px;
  padding: 0 12px;
}

.questions-toolbar__filters :deep(.search-field .form-field__control),
.questions-toolbar__filters :deep(.search-field .form-field__input) {
  height: 24px;
  min-height: 24px;
}

@media (max-width: 1180px) {
  .questions-toolbar__filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .questions-toolbar__filters {
    grid-template-columns: 1fr;
  }
}
</style>
