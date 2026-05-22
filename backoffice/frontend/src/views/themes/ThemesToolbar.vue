<template>
  <BaseToolBar
    :reset-label="$t('resetFilters')"
    :reset-icon="mdiRefresh"
    :reset-disabled="!hasActiveFilters"
    :primary-label="$t('themes.table.create')"
    :primary-icon="mdiPlus"
    :show-primary="true"
    @reset="resetFilters"
    @primary="handleCreateTheme"
  >
    <div class="themes-toolbar__filters">
      <FormField
        id="themes-search"
        class="search-field"
        :model-value="modelValue"
        :label="$t('themes.filters.search')"
        :placeholder="$t('themes.filters.searchPlaceholder')"
        inputmode="search"
        autocomplete="off"
        :neon="false"
        @update:model-value="$emit('update:modelValue', $event)"
      />

      <SelectField
        id="themes-status-filter"
        :model-value="statusFilter"
        :label="$t('themes.filters.status')"
        :options="statusOptions"
        @update:model-value="$emit('update:statusFilter', $event)"
      />

      <SelectField
        id="themes-mode-filter"
        :model-value="modeFilter"
        :label="$t('themes.filters.mode')"
        :options="modeOptions"
        @update:model-value="$emit('update:modeFilter', $event)"
      />

      <SelectField
        id="themes-scope-filter"
        :model-value="scopeFilter"
        :label="$t('themes.filters.scope')"
        :options="scopeOptions"
        @update:model-value="$emit('update:scopeFilter', $event)"
      />
    </div>
  </BaseToolBar>
</template>

<script setup lang="ts">
import { mdiPlus, mdiRefresh } from '@mdi/js'
import {
  THEME_MODE_AUDIO,
  THEME_MODE_CLASSIC,
  THEME_MODE_IMAGE,
  THEME_MODE_MIXED,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
  THEME_STATUS_ACTIVE,
  THEME_STATUS_DELETED,
  THEME_STATUS_DRAFT,
  THEME_STATUS_INACTIVE,
} from '@quizzup/shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import BaseToolBar from '@/components/ui/BaseToolBar.vue'
import FormField from '@/components/ui/form/FormField.vue'
import SelectField from '@/components/ui/form/SelectField.vue'
import type { SelectFieldOption } from '@/types/form'

const props = withDefaults(
  defineProps<{
    modelValue: string
    statusFilter?: string
    modeFilter?: string
    scopeFilter?: string
    canShowDeletedStatus?: boolean
  }>(),
  {
    statusFilter: '',
    modeFilter: '',
    scopeFilter: '',
    canShowDeletedStatus: false,
  },
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'update:statusFilter', value: string): void
  (event: 'update:modeFilter', value: string): void
  (event: 'update:scopeFilter', value: string): void
}>()

const router = useRouter()
const { t } = useI18n()

const hasActiveFilters = computed(
  () =>
    props.modelValue.trim() !== '' ||
    props.statusFilter !== '' ||
    props.modeFilter !== '' ||
    props.scopeFilter !== '',
)

const statusOptions = computed<SelectFieldOption[]>(() => {
  const options: SelectFieldOption[] = [
    {
      label: t('themes.filters.allStatuses'),
      value: '',
    },
    {
      label: t('themes.status.active'),
      value: String(THEME_STATUS_ACTIVE),
    },
    {
      label: t('themes.status.inactive'),
      value: String(THEME_STATUS_INACTIVE),
    },
    {
      label: t('themes.status.draft'),
      value: String(THEME_STATUS_DRAFT),
    },
  ]

  if (props.canShowDeletedStatus) {
    options.push({
      label: t('themes.status.deleted'),
      value: String(THEME_STATUS_DELETED),
    })
  }

  return options
})

const modeOptions = computed<SelectFieldOption[]>(() => [
  {
    label: t('themes.filters.allModes'),
    value: '',
  },
  {
    label: t('themes.mode.classic'),
    value: THEME_MODE_CLASSIC,
  },
  {
    label: t('themes.mode.image'),
    value: THEME_MODE_IMAGE,
  },
  {
    label: t('themes.mode.audio'),
    value: THEME_MODE_AUDIO,
  },
  {
    label: t('themes.mode.mixed'),
    value: THEME_MODE_MIXED,
  },
])

const scopeOptions = computed<SelectFieldOption[]>(() => [
  {
    label: t('themes.filters.allScopes'),
    value: '',
  },
  {
    label: t('themes.scope.global'),
    value: THEME_SCOPE_GLOBAL,
  },
  {
    label: t('themes.scope.company'),
    value: THEME_SCOPE_COMPANY,
  },
])

function resetFilters(): void {
  emit('update:modelValue', '')
  emit('update:statusFilter', '')
  emit('update:modeFilter', '')
  emit('update:scopeFilter', '')
}

function handleCreateTheme(): void {
  void router.push({ name: 'themes-create' })
}
</script>

<style scoped>
.themes-toolbar__filters {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) repeat(3, minmax(150px, 180px));
  align-items: end;
  gap: 12px;
  width: 100%;
  min-width: 0;
}

.themes-toolbar__filters :deep(select),
.themes-toolbar__filters :deep(.select-field__trigger) {
  box-sizing: border-box;
  width: 100%;
  height: 46px;
  min-height: 46px;
}

.themes-toolbar__filters :deep(.search-field input) {
  box-sizing: border-box;
  height: 24px;
  min-height: 24px;
  padding: 0 12px;
}

.themes-toolbar__filters :deep(.search-field .form-field__control),
.themes-toolbar__filters :deep(.search-field .form-field__input) {
  height: 24px;
  min-height: 24px;
}

@media (max-width: 1080px) {
  .themes-toolbar__filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .themes-toolbar__filters {
    grid-template-columns: 1fr;
  }
}
</style>
