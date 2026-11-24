<template>
  <BaseToolBar
    :title="$t('vouchers.filters.title')"
    :reset-label="$t('resetFilters')"
    :reset-icon="mdiRefresh"
    :reset-disabled="stateFilter === ''"
    :active-filters="activeFilters"
    @reset="$emit('update:stateFilter', '')"
  >
    <div
      class="vouchers-toolbar__filters"
      :class="{ 'vouchers-toolbar__filters--company': showCompany }"
    >
      <SelectField
        v-if="showCompany"
        id="vouchers-company-filter"
        :model-value="companyId"
        :label="$t('vouchers.filters.company')"
        :options="companyOptions"
        @update:model-value="$emit('update:companyId', $event)"
      />

      <SelectField
        id="vouchers-state-filter"
        :model-value="stateFilter"
        :label="$t('vouchers.filters.state')"
        :options="stateOptions"
        @update:model-value="$emit('update:stateFilter', $event)"
      />
    </div>
  </BaseToolBar>
</template>

<script setup lang="ts">
import { mdiRefresh } from '@mdi/js'
import { VOUCHER_STATES } from '@quizzup/shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseToolBar, { type ActiveFilter } from '@/components/ui/BaseToolBar.vue'
import SelectField from '@/components/ui/form/SelectField.vue'
import type { SelectFieldOption } from '@/types/form'
import { getVoucherStateLabelKey } from '@/utils/voucher/state'

const props = withDefaults(
  defineProps<{
    stateFilter?: string
    companyId?: string
    companyOptions?: SelectFieldOption[]
    showCompany?: boolean
  }>(),
  { stateFilter: '', companyId: '', companyOptions: () => [], showCompany: false }
)

const emit = defineEmits<{
  (event: 'update:stateFilter', value: string): void
  (event: 'update:companyId', value: string): void
}>()

const { t } = useI18n()

const stateOptions = computed<SelectFieldOption[]>(() => [
  { label: t('vouchers.filters.allStates'), value: '' },
  ...VOUCHER_STATES.map((state) => ({ label: t(getVoucherStateLabelKey(state)), value: state })),
])

const activeFilters = computed<ActiveFilter[]>(() =>
  props.stateFilter
    ? [
        {
          key: 'state',
          label: t(`vouchers.state.${props.stateFilter}`),
          onRemove: () => emit('update:stateFilter', ''),
        },
      ]
    : []
)
</script>

<style scoped>
.vouchers-toolbar__filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 220px));
  align-items: end;
  gap: 12px;
  width: 100%;
  min-width: 0;
}

.vouchers-toolbar__filters--company {
  grid-template-columns: minmax(220px, 280px) repeat(auto-fit, minmax(180px, 220px));
}

/* Cibles de 48 px, comme les autres barres de filtres. */
.vouchers-toolbar__filters :deep(select),
.vouchers-toolbar__filters :deep(.select-field__trigger) {
  box-sizing: border-box;
  width: 100%;
  height: 48px;
  min-height: 48px;
}

@media (max-width: 700px) {
  .vouchers-toolbar__filters,
  .vouchers-toolbar__filters--company {
    grid-template-columns: 1fr;
  }
}
</style>
