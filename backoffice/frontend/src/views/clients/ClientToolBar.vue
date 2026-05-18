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
import type { SelectFieldOption } from '@/components/ui/form/SelectField.vue'
import SelectField from '@/components/ui/form/SelectField.vue'
import {
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_INACTIVE,
} from '@/CONSTANTS'
import { getCreateCompanyRoute } from '@/router/clients'
import type { ClientStatusFilter } from '@/types/company'

const props = withDefaults(
  defineProps<{
    modelValue: string
    statusFilter?: ClientStatusFilter
  }>(),
  {
    statusFilter: COMPANY_STATUS_ACTIVE,
  },
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'update:statusFilter', value: ClientStatusFilter): void
}>()

const router = useRouter()
const { t } = useI18n()

const statusOptions = computed<SelectFieldOption[]>(() => [
  {
    label: String(t('clients.filters.statusOptions.active')),
    value: COMPANY_STATUS_ACTIVE,
  },
  {
    label: String(t('clients.filters.statusOptions.inactive')),
    value: COMPANY_STATUS_INACTIVE,
  },
  {
    label: String(t('clients.filters.statusOptions.all')),
    value: 'all',
  },
])

const hasActiveFilters = computed(
  () => props.modelValue.trim() !== '' || props.statusFilter !== COMPANY_STATUS_ACTIVE,
)

function handleCreateCompany(): void {
  router.push(getCreateCompanyRoute())
}

function resetFilters(): void {
  emit('update:modelValue', '')
  emit('update:statusFilter', COMPANY_STATUS_ACTIVE)
}

function handleStatusChange(value: string): void {
  switch (value) {
    case String(COMPANY_STATUS_ACTIVE):
      emit('update:statusFilter', COMPANY_STATUS_ACTIVE)
      return

    case String(COMPANY_STATUS_INACTIVE):
      emit('update:statusFilter', COMPANY_STATUS_INACTIVE)
      return

    case 'all':
      emit('update:statusFilter', 'all')
      return

    default:
      emit('update:statusFilter', props.statusFilter)
  }
}
</script>

<style scoped>
.clients-toolbar__filters {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  align-items: end;
  gap: 12px;
}

.clients-toolbar__filters :deep(input),
.clients-toolbar__filters :deep(select),
.clients-toolbar__filters :deep(.select-field__trigger) {
  box-sizing: border-box;
  height: 46px;
  min-height: 46px;
}

@media (max-width: 980px) {
  .clients-toolbar__filters {
    grid-template-columns: 1fr;
  }
}
</style>
