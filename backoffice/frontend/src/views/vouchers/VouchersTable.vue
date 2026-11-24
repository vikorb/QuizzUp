<template>
  <BaseCard
    :title="$t('vouchers.list.title')"
    :neon="true"
    :no-hover="true"
    :loading="loading"
    :error="error"
    :empty="vouchers.length === 0"
    :loading-label="$t('vouchers.list.loading')"
    :empty-label="$t('vouchers.list.empty')"
    error-namespace="vouchers.errors"
    class="vouchers-table-card"
  >
    <template #actions>
      <UiButton v-if="error" variant="default" type="button" @click="emit('retry')">
        {{ $t('vouchers.list.retry') }}
      </UiButton>
    </template>

    <BaseTable :columns="columns" :items="tableItems" row-key="id">
      <template #cell-code="{ value }">
        <span class="voucher-code">{{ value }}</span>
      </template>

      <template #cell-holder="{ item }">
        {{ getVoucherHolderNames(toVoucher(item)) }}
      </template>

      <template #cell-state="{ item }">
        <StatusPill
          :tone="getVoucherStateTone(toVoucher(item).state)"
          :label="$t(getVoucherStateLabelKey(toVoucher(item).state))"
        />
      </template>

      <template #cell-expiresAt="{ value }">
        <span class="voucher-date">{{ formatGameDate(toDateValue(value), locale, false) }}</span>
      </template>

      <template #cell-actions="{ item }">
        <UiButton
          v-if="canCancelVoucher(role, toVoucher(item).state)"
          variant="danger"
          type="button"
          data-test="voucher-cancel"
          @click="emit('cancel', toVoucher(item))"
        >
          {{ $t('vouchers.cancel.action') }}
        </UiButton>
      </template>
    </BaseTable>
  </BaseCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseCard from '@/components/ui/BaseCard.vue'
import type { BaseTableColumn } from '@/components/ui/BaseTable.vue'
import BaseTable from '@/components/ui/BaseTable.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { authState } from '@/state/authState'
import type { Voucher } from '@/types/voucher'
import { formatGameDate } from '@/utils/game/format'
import {
  canCancelVoucher,
  getVoucherHolderNames,
  getVoucherStateLabelKey,
  getVoucherStateTone,
} from '@/utils/voucher/state'

const props = defineProps<{
  vouchers: Voucher[]
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  (event: 'retry'): void
  (event: 'cancel', voucher: Voucher): void
}>()

const { t, locale } = useI18n()

const role = computed(() => authState.me.value?.role)

const columns = computed<BaseTableColumn[]>(() => [
  { key: 'code', label: t('vouchers.list.columns.code') },
  { key: 'label', label: t('vouchers.list.columns.label') },
  { key: 'holder', label: t('vouchers.list.columns.holder') },
  { key: 'state', label: t('vouchers.list.columns.state') },
  { key: 'expiresAt', label: t('vouchers.list.columns.expiresAt') },
  { key: 'actions', label: t('vouchers.list.columns.actions'), align: 'right' },
])

const tableItems = computed(() => props.vouchers.map((voucher) => ({ ...voucher })))

function toVoucher(item: Record<string, unknown>): Voucher {
  return item as Voucher
}

function toDateValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
</script>

<style scoped>
.vouchers-table-card {
  max-height: 100%;
  margin-top: 10px;
}

.voucher-code {
  color: var(--accent-cyan);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.06em;
}

.voucher-date {
  color: var(--text-1);
  white-space: nowrap;
}
</style>
