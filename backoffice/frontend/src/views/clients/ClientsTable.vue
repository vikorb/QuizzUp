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
      <UiButton v-if="props.error" variant="default" type="button" @click="$emit('retry')">
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

      <template #cell-actions="{ item }">
        <ClientTableActions
          :item="item"
          @view-accounts="$emit('view-accounts', $event)"
          @edit="$emit('edit', $event)"
          @updated="handleCompanyUpdated"
          @deleted="handleCompanyDeleted"
          @error="$emit('error', $event)"
        />
      </template>
    </BaseTable>
  </BaseCard>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseCard from '@/components/ui/BaseCard.vue'
import type { BaseTableColumn } from '@/components/ui/BaseTable.vue'
import BaseTable from '@/components/ui/BaseTable.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { Company, CompanyTableRow } from '@/types/company'

import ClientTableActions from './createClient/clientTable/ClientTableActions.vue'

const props = defineProps<{
  companies: Company[]
  loading: boolean
  error: string | null
}>()

defineEmits<{
  (event: 'retry'): void
  (event: 'view-accounts', companyId: number): void
  (event: 'edit', companyId: number): void
  (event: 'error', errorCode: string): void
}>()

const { t } = useI18n()

const localCompanies = ref<CompanyTableRow[]>([...props.companies])

watch(
  () => props.companies,
  (nextCompanies) => {
    localCompanies.value = [...nextCompanies]
  },
  { deep: true }
)

const columns = computed<BaseTableColumn[]>(() => [
  {
    key: 'name',
    label: String(t('clients.table.columns.name')),
  },
  {
    key: 'email',
    label: String(t('clients.table.columns.email')),
  },
  {
    key: 'accountsCount',
    label: String(t('clients.table.columns.accounts')),
    align: 'right',
  },
  {
    key: 'actions',
    label: String(t('clients.table.columns.actions')),
    align: 'right',
  },
])

const tableItems = computed<CompanyTableRow[]>(() => localCompanies.value)

function handleCompanyUpdated(updatedCompany: CompanyTableRow): void {
  localCompanies.value = localCompanies.value.map((company) =>
    company.id === updatedCompany.id ? updatedCompany : company
  )
}

function handleCompanyDeleted(companyId: number): void {
  localCompanies.value = localCompanies.value.filter((company) => company.id !== companyId)
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
  display: inline-block;
  width: 100%;
  text-align: right;
}
</style>
