<template>
  <BaseCard
    :title="$t('rooms.table.title')"
    :neon="true"
    :no-hover="true"
    :loading="props.loading"
    :error="props.error"
    :empty="tableItems.length === 0"
    :loading-label="$t('rooms.table.loading')"
    :empty-label="$t('rooms.table.empty')"
    error-namespace="rooms.errors"
    class="rooms-table-card"
  >
    <template #actions>
      <UiButton v-if="props.error" variant="default" type="button" @click="emit('retry')">
        {{ $t('rooms.table.retry') }}
      </UiButton>
    </template>

    <BaseTable :columns="columns" :items="tableItems" row-key="id">
      <template #cell-name="{ value }">
        <span class="name">{{ value }}</span>
      </template>

      <template #cell-hasConfig="{ value }">
        <span
          class="config"
          :class="{ 'config--set': value === true }"
          :data-config="value === true ? 'set' : 'unset'"
        >
          <MdIcon :path="value === true ? mdiTuneVariant : mdiMinusCircleOutline" :size="14" />
          {{ value === true ? $t('rooms.config.set') : $t('rooms.config.unset') }}
        </span>
      </template>

      <template #cell-status="{ value }">
        <StatusPill :tone="getStatusTone(value)" :label="getStatusLabel(value)" />
      </template>

      <template v-if="props.canManage" #cell-actions="{ item }">
        <RoomTableActions
          :company-id="props.companyId"
          :item="toRow(item)"
          @edit="emit('edit', $event)"
          @account="emit('account', $event)"
          @updated="emit('updated', $event)"
          @deleted="emit('deleted', $event)"
          @error="emit('error', $event)"
        />
      </template>
    </BaseTable>
  </BaseCard>
</template>

<script setup lang="ts">
import { mdiMinusCircleOutline, mdiTuneVariant } from '@mdi/js'
import { ROOM_STATUS_ACTIVE, ROOM_STATUS_DELETED, ROOM_STATUS_INACTIVE } from '@quizzup/shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseCard from '@/components/ui/BaseCard.vue'
import type { BaseTableColumn } from '@/components/ui/BaseTable.vue'
import BaseTable from '@/components/ui/BaseTable.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { Room, RoomTableRow } from '@/types/room'
import { toRoomTableRow } from '@/utils/room/list'
import { toRoomStatus } from '@/utils/room/status'

import RoomTableActions from './table/RoomTableActions.vue'

const props = withDefaults(
  defineProps<{
    companyId: number
    rooms: Room[]
    loading: boolean
    error: string | null
    canManage?: boolean
  }>(),
  {
    canManage: false,
  }
)

const emit = defineEmits<{
  (event: 'retry'): void
  (event: 'edit', roomId: number): void
  (event: 'account', roomId: number): void
  (event: 'updated', room: Room): void
  (event: 'deleted', roomId: number): void
  (event: 'error', errorCode: string): void
}>()

const { t } = useI18n()

const columns = computed<BaseTableColumn[]>(() => {
  const baseColumns: BaseTableColumn[] = [
    {
      key: 'name',
      label: String(t('rooms.table.columns.name')),
    },
    {
      key: 'hasConfig',
      label: String(t('rooms.table.columns.config')),
    },
    {
      key: 'status',
      label: String(t('rooms.table.columns.status')),
    },
  ]

  // Lecture seule (rôle user) : pas de colonne d'actions du tout.
  if (props.canManage) {
    baseColumns.push({
      key: 'actions',
      label: String(t('rooms.table.columns.actions')),
      align: 'right',
    })
  }

  return baseColumns
})

const tableItems = computed<RoomTableRow[]>(() => props.rooms.map(toRoomTableRow))

function toRow(item: Record<string, unknown>): RoomTableRow {
  return item as RoomTableRow
}

function getStatusLabel(value: unknown): string {
  const status = toRoomStatus(value)

  if (status === ROOM_STATUS_ACTIVE) {
    return t('rooms.status.active')
  }

  if (status === ROOM_STATUS_INACTIVE) {
    return t('rooms.status.inactive')
  }

  if (status === ROOM_STATUS_DELETED) {
    return t('rooms.status.deleted')
  }

  return t('rooms.status.unknown')
}

function getStatusTone(value: unknown): 'ok' | 'danger' | 'muted' {
  const status = toRoomStatus(value)

  if (status === ROOM_STATUS_ACTIVE) {
    return 'ok'
  }

  if (status === ROOM_STATUS_DELETED) {
    return 'danger'
  }

  return 'muted'
}
</script>

<style scoped>
.rooms-table-card {
  max-height: 100%;
  margin-top: 10px;
}

.name {
  font-weight: 800;
  color: var(--text-0);
}

/* Même puce neutre que le rôle d'un compte ; teinte « édition » quand la config existe. */
.config {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  padding: 3px 9px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-2);
  background: var(--surface-2);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.config--set {
  border-color: var(--edit);
  color: var(--edit);
  background: var(--edit-bg);
}
</style>
