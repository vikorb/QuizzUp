<template>
  <BaseCard
    :title="$t('accounts.table.title')"
    :neon="true"
    :no-hover="true"
    :loading="props.loading"
    :error="props.error"
    :empty="tableItems.length === 0"
    :loading-label="$t('accounts.table.loading')"
    :empty-label="$t('accounts.table.empty')"
    error-namespace="accounts.errors"
    class="accounts-table-card"
  >
    <template #actions>
      <UiButton v-if="props.error" variant="default" type="button" @click="emit('retry')">
        {{ $t('accounts.table.retry') }}
      </UiButton>
    </template>

    <BaseTable :columns="columns" :items="tableItems" row-key="id">
      <template #cell-displayName="{ value }">
        <span class="name">{{ value }}</span>
      </template>

      <template #cell-username="{ value }">
        <span class="muted">{{ value }}</span>
      </template>

      <template #cell-email="{ value }">
        <span class="email">{{ value }}</span>
      </template>

      <template #cell-role="{ value }">
        <span class="role">{{ value }}</span>
      </template>

      <template #cell-status="{ value }">
        <span class="status" :class="`status--${value}`">
          {{ getStatusLabel(value) }}
        </span>
      </template>

      <template #cell-actions="{ item }">
        <AccountTableActions
          :company-id="props.companyId"
          :item="toRow(item)"
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
import {
  ADMIN_STATUS_ACTIVE,
  ADMIN_STATUS_DELETED,
  ADMIN_STATUS_INACTIVE,
} from '@quizzup/shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseCard from '@/components/ui/BaseCard.vue'
import type { BaseTableColumn } from '@/components/ui/BaseTable.vue'
import BaseTable from '@/components/ui/BaseTable.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { Account, AccountTableRow } from '@/types/account'
import { toAccountTableRow } from '@/utils/account/list'
import { toAccountStatus } from '@/utils/account/status'

import AccountTableActions from './table/AccountTableActions.vue'

const props = defineProps<{
  companyId: number
  accounts: Account[]
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  (event: 'retry'): void
  (event: 'edit', accountId: number): void
  (event: 'updated', account: Account): void
  (event: 'deleted', accountId: number): void
  (event: 'error', errorCode: string): void
}>()

const { t } = useI18n()

const columns = computed<BaseTableColumn[]>(() => [
  {
    key: 'displayName',
    label: String(t('accounts.table.columns.name')),
  },
  {
    key: 'username',
    label: String(t('accounts.table.columns.username')),
  },
  {
    key: 'email',
    label: String(t('accounts.table.columns.email')),
  },
  {
    key: 'role',
    label: String(t('accounts.table.columns.role')),
  },
  {
    key: 'status',
    label: String(t('accounts.table.columns.status')),
  },
  {
    key: 'actions',
    label: String(t('accounts.table.columns.actions')),
    align: 'right',
  },
])

const tableItems = computed<AccountTableRow[]>(() => props.accounts.map(toAccountTableRow))

function toRow(item: Record<string, unknown>): AccountTableRow {
  return item as AccountTableRow
}

function getStatusLabel(value: unknown): string {
  const status = toAccountStatus(value)

  if (status === ADMIN_STATUS_ACTIVE) {
    return t('accounts.status.active')
  }

  if (status === ADMIN_STATUS_INACTIVE) {
    return t('accounts.status.inactive')
  }

  if (status === ADMIN_STATUS_DELETED) {
    return t('accounts.status.deleted')
  }

  return t('accounts.status.unknown')
}
</script>

<style scoped>
.accounts-table-card {
  max-height: 100%;
  margin-top: 10px;
}

.name {
  font-weight: 800;
  color: var(--text-0);
}

.email,
.muted {
  color: var(--text-1);
}

.role {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 9px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-1);
  background: rgba(255, 255, 255, 0.04);
  font-size: 12px;
  font-weight: 700;
}

.status {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
}

.status--0 {
  color: #ffd36e;
  background: rgba(255, 190, 70, 0.12);
}

.status--1 {
  color: #7dffb2;
  background: rgba(45, 255, 137, 0.12);
}

.status--2 {
  color: #ff8a8a;
  background: rgba(255, 107, 107, 0.12);
}
</style>
