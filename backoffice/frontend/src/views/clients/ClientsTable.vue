<template>
  <BaseCard
    :title="$t('clients.table.title')"
    :neon="true"
    :no-hover="true"
    :loading="loading"
    :error="error"
    :empty="companies.length === 0"
    :loading-label="$t('clients.table.loading')"
    :empty-label="$t('clients.table.empty')"
    error-namespace="clients.errors"
    class="clients-table-card"
  >
    <template #actions>
      <UiButton v-if="error" variant="default" type="button" @click="$emit('retry')">
        {{ $t('clients.table.retry') }}
      </UiButton>
    </template>

    <BaseTable
      :columns="columns"
      :items="tableItems"
      row-key="id"
    >
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
        <div class="actions">
          <UiButton
            class="icon"
            variant="icon"
            type="button"
            @click="handleViewAccounts(item)"
          >
            <MdIcon :path="mdiAccountDetailsOutline" :size="18" />
          </UiButton>

          <UiButton
            class="icon"
            variant="icon"
            type="button"
            @click="handleEditCompany(item)"
          >
            <MdIcon :path="mdiPencilOutline" :size="18" />
          </UiButton>
        </div>
      </template>
    </BaseTable>
  </BaseCard>
</template>

<script setup lang="ts">
import { mdiAccountDetailsOutline, mdiPencilOutline } from '@mdi/js'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import BaseCard from '@/components/ui/BaseCard.vue'
import type { BaseTableColumn } from '@/components/ui/BaseTable.vue'
import BaseTable from '@/components/ui/BaseTable.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { getCompanyAccountsRoute, getEditCompanyRoute } from '@/router/clients'
import type { Company, CompanyTableRow } from '@/types/company'
import { isCompanyTableRow } from '@/utils/company'

const props = defineProps<{
  companies: Company[]
  loading: boolean
  error: string | null
}>()

defineEmits<{
  (event: 'retry'): void
}>()

const router = useRouter()
const { t } = useI18n()

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

const tableItems = computed<CompanyTableRow[]>(() => props.companies)

function handleEditCompany(item: Record<string, unknown>): void {
  if (!isCompanyTableRow(item)) {
    return
  }

  router.push(getEditCompanyRoute(item.id))
}

function handleViewAccounts(item: Record<string, unknown>): void {
  if (!isCompanyTableRow(item)) {
    return
  }

  router.push(getCompanyAccountsRoute(item.id))
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

.actions {
  display: flex;
  justify-content: flex-end;
  white-space: nowrap;
}

.icon {
  margin-left: 8px;
}
</style>
