<template>
  <BaseCard
    :title="$t('clients.table.title')"
    :neon="true"
    :no-hover="true"
    :loading="props.loading"
    :error="props.error"
    :empty="tableItems.length === 0"
    :loading-label="$t('clients.table.loading')"
    :empty-label="$t('clients.table.empty')"
    error-namespace="clients.errors"
    class="clients-table-card"
  >
    <template #actions>
      <UiButton v-if="props.error" variant="default" type="button" @click="emit('retry')">
        {{ $t('clients.table.retry') }}
      </UiButton>
    </template>

    <BaseTable :columns="columns" :items="tableItems" row-key="id">
      <template #cell-name="{ value }">
        <span class="name">{{ value }}</span>
      </template>

      <template #cell-email="{ value }">
        <span class="email">{{ value }}</span>
      </template>

      <template #cell-accountsCount="{ value }">
        <span class="num">{{ value ?? '—' }}</span>
      </template>

      <template #cell-status="{ value }">
        <StatusPill :tone="getStatusTone(value)" :label="getStatusLabel(value)" />
      </template>

      <template #cell-actions="{ item }">
        <ClientTableActions
          :item="toCompanyTableRow(item)"
          @view-accounts="emit('view-accounts', $event)"
          @edit="emit('edit', $event)"
          @updated="emit('updated', $event)"
          @deleted="emit('deleted', $event)"
          @error="emit('error', $event)"
        />
      </template>
    </BaseTable>
  </BaseCard>
</template>

<script setup lang="ts">
import { COMPANY_STATUS_ACTIVE, COMPANY_STATUS_DELETED } from '@quizzup/shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseCard from '@/components/ui/BaseCard.vue'
import BaseTable from '@/components/ui/BaseTable.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { Company, CompanyTableRow } from '@/types/company'
import {
  getClientStatusLabel,
  getClientTableColumns,
  toCompanyTableRow,
} from '@/utils/company/table'

import ClientTableActions from './table/ClientTableActions.vue'

const props = defineProps<{
  companies: Company[]
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  (event: 'retry'): void
  (event: 'view-accounts', companyId: number): void
  (event: 'edit', companyId: number): void
  (event: 'updated', company: CompanyTableRow): void
  (event: 'deleted', companyId: number): void
  (event: 'error', errorCode: string): void
}>()

const { t } = useI18n()

const columns = computed(() => getClientTableColumns(t))

const tableItems = computed<CompanyTableRow[]>(() =>
  props.companies.map((company) => ({ ...company }) as CompanyTableRow)
)

function getStatusLabel(value: unknown): string {
  return getClientStatusLabel(value, t)
}

function getStatusTone(value: unknown): 'ok' | 'danger' | 'muted' {
  if (value === COMPANY_STATUS_ACTIVE) {
    return 'ok'
  }

  if (value === COMPANY_STATUS_DELETED) {
    return 'danger'
  }

  return 'muted'
}
</script>

<style scoped>
.clients-table-card {
  max-height: 100%;
  margin-top: 10px;
}

.name {
  font-weight: 800;
  color: var(--text-0);
}

.email {
  color: var(--text-1);
}

.num {
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}
</style>
