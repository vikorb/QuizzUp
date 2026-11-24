<template>
  <BaseToolBar
    :title="$t('stats.filters.title')"
    :reset-label="$t('resetFilters')"
    :reset-icon="mdiRefresh"
    :reset-disabled="!hasActiveFilters"
    :active-filters="activeFilters"
    @reset="resetFilters"
  >
    <div class="stats-toolbar__filters" :class="{ 'stats-toolbar__filters--company': showCompany }">
      <SelectField
        v-if="showCompany"
        id="stats-company-filter"
        :model-value="companyId"
        :label="$t('stats.filters.company')"
        :options="companyOptions"
        @update:model-value="$emit('update:companyId', $event)"
      />

      <SelectField
        id="stats-room-filter"
        :model-value="roomFilter"
        :label="$t('stats.filters.room')"
        :options="roomSelectOptions"
        @update:model-value="$emit('update:roomFilter', $event)"
      />

      <FormField
        id="stats-from-filter"
        type="date"
        :model-value="from"
        :label="$t('stats.filters.from')"
        @update:model-value="$emit('update:from', $event)"
      />

      <FormField
        id="stats-to-filter"
        type="date"
        :model-value="to"
        :label="$t('stats.filters.to')"
        @update:model-value="$emit('update:to', $event)"
      />
    </div>
  </BaseToolBar>
</template>

<script setup lang="ts">
import { mdiRefresh } from '@mdi/js'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseToolBar, { type ActiveFilter } from '@/components/ui/BaseToolBar.vue'
import FormField from '@/components/ui/form/FormField.vue'
import SelectField from '@/components/ui/form/SelectField.vue'
import type { SelectFieldOption } from '@/types/form'
import { formatGameDay } from '@/utils/game/format'

const props = withDefaults(
  defineProps<{
    roomFilter?: string
    roomOptions?: SelectFieldOption[]
    /** Jour de début et de fin (`AAAA-MM-JJ`), vide = sans borne. */
    from?: string
    to?: string
    companyId?: string
    companyOptions?: SelectFieldOption[]
    showCompany?: boolean
  }>(),
  {
    roomFilter: '',
    roomOptions: () => [],
    from: '',
    to: '',
    companyId: '',
    companyOptions: () => [],
    showCompany: false,
  }
)

const emit = defineEmits<{
  (event: 'update:roomFilter', value: string): void
  (event: 'update:from', value: string): void
  (event: 'update:to', value: string): void
  (event: 'update:companyId', value: string): void
}>()

const { t, locale } = useI18n()

const hasActiveFilters = computed(
  () => props.roomFilter !== '' || props.from !== '' || props.to !== ''
)

const roomSelectOptions = computed<SelectFieldOption[]>(() => [
  { label: t('stats.filters.allRooms'), value: '' },
  ...props.roomOptions,
])

const activeFilters = computed<ActiveFilter[]>(() => {
  const room = props.roomOptions.find((option) => String(option.value) === props.roomFilter)
  const filters: ActiveFilter[] = []

  if (room) {
    filters.push({ key: 'room', label: room.label, onRemove: () => emit('update:roomFilter', '') })
  }

  if (props.from) {
    filters.push({
      key: 'from',
      label: `${t('stats.filters.from')} ${formatGameDay(props.from, locale.value)}`,
      onRemove: () => emit('update:from', ''),
    })
  }

  if (props.to) {
    filters.push({
      key: 'to',
      label: `${t('stats.filters.to')} ${formatGameDay(props.to, locale.value)}`,
      onRemove: () => emit('update:to', ''),
    })
  }

  return filters
})

// La compagnie n'est pas un filtre : c'est le contexte de l'écran, on ne la réinitialise pas.
function resetFilters(): void {
  emit('update:roomFilter', '')
  emit('update:from', '')
  emit('update:to', '')
}
</script>

<style scoped>
.stats-toolbar__filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 220px));
  align-items: end;
  gap: 12px;
  width: 100%;
  min-width: 0;
}

.stats-toolbar__filters--company {
  grid-template-columns: minmax(220px, 280px) repeat(auto-fit, minmax(180px, 220px));
}

/* Le sélecteur natif des champs date (icône, calendrier) suit le fond sombre de l'écran. */
.stats-toolbar__filters :deep(input[type='date']) {
  color-scheme: dark;
}

/* Cibles de 48 px : les listes déroulantes et les champs date ont la même hauteur. */
.stats-toolbar__filters :deep(select),
.stats-toolbar__filters :deep(.select-field__trigger),
.stats-toolbar__filters :deep(.ff__control) {
  box-sizing: border-box;
  width: 100%;
  height: 48px;
  min-height: 48px;
}

@media (max-width: 700px) {
  .stats-toolbar__filters,
  .stats-toolbar__filters--company {
    grid-template-columns: 1fr;
  }
}
</style>
