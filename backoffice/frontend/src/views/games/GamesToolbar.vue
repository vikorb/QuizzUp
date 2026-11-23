<template>
  <BaseToolBar
    :title="$t('games.filters.title')"
    :reset-label="$t('resetFilters')"
    :reset-icon="mdiRefresh"
    :reset-disabled="!hasActiveFilters"
    :active-filters="activeFilters"
    :primary-label="$t('games.table.create')"
    :primary-icon="mdiPlay"
    :show-primary="canCreate"
    @reset="resetFilters"
    @primary="$emit('create')"
  >
    <div class="games-toolbar__filters" :class="{ 'games-toolbar__filters--company': showCompany }">
      <SelectField
        v-if="showCompany"
        id="games-company-filter"
        :model-value="companyId"
        :label="$t('games.filters.company')"
        :options="companyOptions"
        @update:model-value="$emit('update:companyId', $event)"
      />

      <SelectField
        id="games-room-filter"
        :model-value="roomFilter"
        :label="$t('games.filters.room')"
        :options="roomSelectOptions"
        @update:model-value="$emit('update:roomFilter', $event)"
      />

      <SelectField
        id="games-state-filter"
        :model-value="stateFilter"
        :label="$t('games.filters.state')"
        :options="stateOptions"
        @update:model-value="$emit('update:stateFilter', $event)"
      />

      <FormField
        id="games-from-filter"
        type="date"
        :model-value="from"
        :label="$t('games.filters.from')"
        @update:model-value="$emit('update:from', $event)"
      />

      <FormField
        id="games-to-filter"
        type="date"
        :model-value="to"
        :label="$t('games.filters.to')"
        @update:model-value="$emit('update:to', $event)"
      />
    </div>
  </BaseToolBar>
</template>

<script setup lang="ts">
import { mdiPlay, mdiRefresh } from '@mdi/js'
import { GAME_STATES } from '@quizzup/shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseToolBar, { type ActiveFilter } from '@/components/ui/BaseToolBar.vue'
import FormField from '@/components/ui/form/FormField.vue'
import SelectField from '@/components/ui/form/SelectField.vue'
import type { SelectFieldOption } from '@/types/form'
import { getGameStateLabelKey } from '@/utils/game/state'

const props = withDefaults(
  defineProps<{
    stateFilter?: string
    roomFilter?: string
    roomOptions?: SelectFieldOption[]
    /** Jour de début et de fin (`AAAA-MM-JJ`), vide = sans borne. */
    from?: string
    to?: string
    companyId?: string
    companyOptions?: SelectFieldOption[]
    showCompany?: boolean
    canCreate?: boolean
  }>(),
  {
    stateFilter: '',
    roomFilter: '',
    roomOptions: () => [],
    from: '',
    to: '',
    companyId: '',
    companyOptions: () => [],
    showCompany: false,
    canCreate: true,
  }
)

const emit = defineEmits<{
  (event: 'update:stateFilter', value: string): void
  (event: 'update:roomFilter', value: string): void
  (event: 'update:from', value: string): void
  (event: 'update:to', value: string): void
  (event: 'update:companyId', value: string): void
  (event: 'create'): void
}>()

const { t } = useI18n()

const hasActiveFilters = computed(
  () => props.stateFilter !== '' || props.roomFilter !== '' || props.from !== '' || props.to !== ''
)

const roomSelectOptions = computed<SelectFieldOption[]>(() => [
  { label: t('games.filters.allRooms'), value: '' },
  ...props.roomOptions,
])

const stateOptions = computed<SelectFieldOption[]>(() => [
  {
    label: t('games.filters.allStates'),
    value: '',
  },
  ...GAME_STATES.map((state) => ({
    label: t(getGameStateLabelKey(state)),
    value: state,
  })),
])

const activeFilters = computed<ActiveFilter[]>(() => {
  const state = stateOptions.value.find(
    (option) => option.value !== '' && option.value === props.stateFilter
  )
  const room = props.roomOptions.find((option) => String(option.value) === props.roomFilter)
  const filters: ActiveFilter[] = []

  if (state) {
    filters.push({
      key: 'state',
      label: state.label,
      onRemove: () => emit('update:stateFilter', ''),
    })
  }

  if (room) {
    filters.push({ key: 'room', label: room.label, onRemove: () => emit('update:roomFilter', '') })
  }

  if (props.from) {
    filters.push({
      key: 'from',
      label: `${t('games.filters.from')} ${props.from}`,
      onRemove: () => emit('update:from', ''),
    })
  }

  if (props.to) {
    filters.push({
      key: 'to',
      label: `${t('games.filters.to')} ${props.to}`,
      onRemove: () => emit('update:to', ''),
    })
  }

  return filters
})

// La compagnie n'est pas un filtre : c'est le contexte de l'écran, on ne la réinitialise pas.
function resetFilters(): void {
  emit('update:stateFilter', '')
  emit('update:roomFilter', '')
  emit('update:from', '')
  emit('update:to', '')
}
</script>

<style scoped>
.games-toolbar__filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 220px));
  align-items: end;
  gap: 12px;
  width: 100%;
  min-width: 0;
}

.games-toolbar__filters--company {
  grid-template-columns: minmax(220px, 280px) repeat(auto-fit, minmax(180px, 220px));
}

/* Cibles de 48 px : les listes déroulantes et les champs date ont la même hauteur. */
.games-toolbar__filters :deep(select),
.games-toolbar__filters :deep(.select-field__trigger),
.games-toolbar__filters :deep(.ff__control) {
  box-sizing: border-box;
  width: 100%;
  height: 48px;
  min-height: 48px;
}

@media (max-width: 700px) {
  .games-toolbar__filters,
  .games-toolbar__filters--company {
    grid-template-columns: 1fr;
  }
}
</style>
