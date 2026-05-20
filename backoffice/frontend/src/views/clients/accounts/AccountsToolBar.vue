<template>
  <BaseToolBar
    :reset-label="$t('resetFilters')"
    :reset-icon="mdiRefresh"
    :reset-disabled="!hasActiveFilters"
    :primary-label="$t('accounts.actions.addAccount')"
    :primary-icon="mdiPlus"
    :show-primary="true"
    @reset="resetFilters"
    @primary="handleCreateAccount"
  >
    <div class="accounts-toolbar__filters">
      <FormField
        id="account-q"
        class="search-field"
        :model-value="modelValue"
        :label="$t('accounts.filters.searchLabel')"
        :placeholder="$t('accounts.filters.searchPlaceholder')"
        inputmode="search"
        autocomplete="off"
        :neon="false"
        @update:model-value="$emit('update:modelValue', $event)"
      />

      <SelectField
        id="account-status-filter"
        :model-value="String(statusFilter)"
        :label="$t('accounts.filters.statusLabel')"
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

import BaseToolBar from '@/components/ui/BaseToolBar.vue'
import FormField from '@/components/ui/form/FormField.vue'
import SelectField from '@/components/ui/form/SelectField.vue'
import type { AccountStatusFilter } from '@/types/account'
import type { SelectFieldOption } from '@/types/form'
import {
  DEFAULT_ACCOUNT_STATUS_FILTER,
  getAccountStatusFilterOptions,
  hasAccountToolbarActiveFilters,
  parseAccountStatusFilter,
} from '@/utils/account/filters'

const props = withDefaults(
  defineProps<{
    modelValue: string
    statusFilter?: AccountStatusFilter
  }>(),
  {
    statusFilter: DEFAULT_ACCOUNT_STATUS_FILTER,
  },
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'update:statusFilter', value: AccountStatusFilter): void
  (event: 'create'): void
}>()

const { t } = useI18n()

const statusOptions = computed<SelectFieldOption[]>(() => getAccountStatusFilterOptions(t))

const hasActiveFilters = computed(() =>
  hasAccountToolbarActiveFilters(props.modelValue, props.statusFilter),
)

function resetFilters(): void {
  emit('update:modelValue', '')
  emit('update:statusFilter', DEFAULT_ACCOUNT_STATUS_FILTER)
}

function handleStatusChange(value: string): void {
  emit('update:statusFilter', parseAccountStatusFilter(value, props.statusFilter))
}

function handleCreateAccount(): void {
  emit('create')
}
</script>

<style scoped>
.accounts-toolbar__filters {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  align-items: end;
  gap: 12px;
}

.accounts-toolbar__filters :deep(select),
.accounts-toolbar__filters :deep(.select-field__trigger) {
  box-sizing: border-box;
  height: 46px;
  min-height: 46px;
}

.accounts-toolbar__filters :deep(.search-field input) {
  box-sizing: border-box;
  height: 24px;
  min-height: 24px;
  padding: 0 12px;
}

.accounts-toolbar__filters :deep(.search-field .form-field__control),
.accounts-toolbar__filters :deep(.search-field .form-field__input) {
  height: 24px;
  min-height: 24px;
}

@media (max-width: 980px) {
  .accounts-toolbar__filters {
    grid-template-columns: 1fr;
  }
}
</style>
