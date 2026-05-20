<template>
  <BaseToolBar
    :reset-label="$t('resetFilters')"
    :reset-icon="mdiRefresh"
    :reset-disabled="!hasActiveFilters"
    :primary-label="$t('clients.actions.addCompany')"
    :primary-icon="mdiPlus"
    :show-primary="true"
    @reset="resetFilters"
    @primary="handleCreateCompany"
  >
    <div class="clients-toolbar__filters">
      <FormField
        id="q"
        class="search-field"
        :model-value="modelValue"
        :label="$t('clients.filters.searchLabel')"
        :placeholder="$t('clients.filters.searchPlaceholder')"
        inputmode="search"
        autocomplete="off"
        :neon="false"
        @update:model-value="$emit('update:modelValue', $event)"
      />

      <SelectField
        id="status-filter"
        :model-value="statusFilter"
        :label="$t('clients.filters.statusLabel')"
        :options="statusOptions"
        @update:model-value="handleStatusChange"
      />
    </div>
  </BaseToolBar>
</template>

<script setup lang="ts">
import { mdiPlus, mdiRefresh } from '@mdi/js'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import BaseToolBar from '@/components/ui/BaseToolBar.vue'
import FormField from '@/components/ui/form/FormField.vue'
import SelectField from '@/components/ui/form/SelectField.vue'
import { getCreateCompanyRoute } from '@/router/clients'
import type { ClientStatusFilter } from '@/types/company'
import type { SelectFieldOption } from '@/types/form'
import {
  DEFAULT_CLIENT_STATUS_FILTER,
  getClientStatusFilterOptions,
  hasClientToolbarActiveFilters,
  parseClientStatusFilter,
} from '@/utils/company/filters'

const props = withDefaults(
  defineProps<{
    modelValue: string
    statusFilter?: ClientStatusFilter
  }>(),
  {
    statusFilter: DEFAULT_CLIENT_STATUS_FILTER,
  },
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'update:statusFilter', value: ClientStatusFilter): void
}>()

const router = useRouter()
const { t } = useI18n()
const statusOptions = computed<SelectFieldOption[]>(() => getClientStatusFilterOptions(t))

const hasActiveFilters = computed(() =>
  hasClientToolbarActiveFilters(props.modelValue, props.statusFilter),
)

function handleCreateCompany(): void {
  router.push(getCreateCompanyRoute())
}

function resetFilters(): void {
  emit('update:modelValue', '')
  emit('update:statusFilter', DEFAULT_CLIENT_STATUS_FILTER)
}

function handleStatusChange(value: string): void {
  emit('update:statusFilter', parseClientStatusFilter(value, props.statusFilter))
}
</script>

<style scoped>
.clients-toolbar__filters {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  align-items: end;
  gap: 12px;
}

.clients-toolbar__filters :deep(select),
.clients-toolbar__filters :deep(.select-field__trigger) {
  box-sizing: border-box;
  height: 46px;
  min-height: 46px;
}

.clients-toolbar__filters :deep(.search-field input) {
  box-sizing: border-box;
  height: 24px;
  min-height: 24px;
  padding: 0 12px;
}

.clients-toolbar__filters :deep(.search-field .form-field__control),
.clients-toolbar__filters :deep(.search-field .form-field__input) {
  height: 24px;
  min-height: 24px;
}

@media (max-width: 980px) {
  .clients-toolbar__filters {
    grid-template-columns: 1fr;
  }
}
</style>
