<template>
  <BaseToolBar
    :title="$t('rooms.toolbar.title')"
    :reset-label="$t('resetFilters')"
    :reset-icon="mdiRefresh"
    :reset-disabled="!hasActiveFilters"
    :active-filters="activeFilters"
    :primary-label="$t('rooms.actions.addRoom')"
    :primary-icon="mdiPlus"
    :show-primary="props.canManage"
    @reset="resetFilters"
    @primary="handleCreateRoom"
  >
    <div class="rooms-toolbar__filters">
      <FormField
        id="room-q"
        class="search-field"
        :model-value="modelValue"
        :label="$t('rooms.filters.searchLabel')"
        :placeholder="$t('rooms.filters.searchPlaceholder')"
        inputmode="search"
        autocomplete="off"
        :neon="false"
        @update:model-value="$emit('update:modelValue', $event)"
      />

      <SelectField
        id="room-status-filter"
        :model-value="String(statusFilter)"
        :label="$t('rooms.filters.statusLabel')"
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

import BaseToolBar, { type ActiveFilter } from '@/components/ui/BaseToolBar.vue'
import FormField from '@/components/ui/form/FormField.vue'
import SelectField from '@/components/ui/form/SelectField.vue'
import type { SelectFieldOption } from '@/types/form'
import type { RoomStatusFilter } from '@/types/room'
import {
  DEFAULT_ROOM_STATUS_FILTER,
  getRoomStatusFilterOptions,
  hasRoomToolbarActiveFilters,
  parseRoomStatusFilter,
} from '@/utils/room/filters'

const props = withDefaults(
  defineProps<{
    modelValue: string
    statusFilter?: RoomStatusFilter
    canManage?: boolean
    canSeeDeleted?: boolean
  }>(),
  {
    statusFilter: DEFAULT_ROOM_STATUS_FILTER,
    canManage: false,
    canSeeDeleted: false,
  }
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'update:statusFilter', value: RoomStatusFilter): void
  (event: 'create'): void
}>()

const { t } = useI18n()

const statusOptions = computed<SelectFieldOption[]>(() =>
  getRoomStatusFilterOptions(t, props.canSeeDeleted)
)

const hasActiveFilters = computed(() =>
  hasRoomToolbarActiveFilters(props.modelValue, props.statusFilter)
)

const activeFilters = computed<ActiveFilter[]>(() => {
  const chips: ActiveFilter[] = []
  const search = props.modelValue.trim()

  if (search !== '') {
    chips.push({
      key: 'search',
      label: `${t('rooms.filters.searchLabel')} : ${search}`,
      onRemove: () => emit('update:modelValue', ''),
    })
  }

  // « Toutes » = pas de filtre → pas de balise. Tout autre statut contraint la vue → balise.
  if (props.statusFilter !== 'all') {
    const status = statusOptions.value.find((option) => option.value === String(props.statusFilter))
    chips.push({
      key: 'status',
      label: status ? status.label : String(props.statusFilter),
      onRemove: () => emit('update:statusFilter', 'all'),
    })
  }

  return chips
})

function resetFilters(): void {
  emit('update:modelValue', '')
  emit('update:statusFilter', DEFAULT_ROOM_STATUS_FILTER)
}

function handleStatusChange(value: string): void {
  emit('update:statusFilter', parseRoomStatusFilter(value, props.statusFilter, props.canSeeDeleted))
}

function handleCreateRoom(): void {
  if (!props.canManage) {
    return
  }

  emit('create')
}
</script>

<style scoped>
.rooms-toolbar__filters {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  align-items: end;
  gap: 12px;
}

.rooms-toolbar__filters :deep(select),
.rooms-toolbar__filters :deep(.select-field__trigger) {
  box-sizing: border-box;
  height: 46px;
  min-height: 46px;
}

.rooms-toolbar__filters :deep(.search-field input) {
  box-sizing: border-box;
  height: 24px;
  min-height: 24px;
  padding: 0 12px;
}

.rooms-toolbar__filters :deep(.search-field .form-field__control),
.rooms-toolbar__filters :deep(.search-field .form-field__input) {
  height: 24px;
  min-height: 24px;
}

@media (max-width: 980px) {
  .rooms-toolbar__filters {
    grid-template-columns: 1fr;
  }
}
</style>
