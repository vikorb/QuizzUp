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
        id="games-state-filter"
        :model-value="stateFilter"
        :label="$t('games.filters.state')"
        :options="stateOptions"
        @update:model-value="$emit('update:stateFilter', $event)"
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
import SelectField from '@/components/ui/form/SelectField.vue'
import type { SelectFieldOption } from '@/types/form'
import { getGameStateLabelKey } from '@/utils/game/state'

const props = withDefaults(
  defineProps<{
    stateFilter?: string
    companyId?: string
    companyOptions?: SelectFieldOption[]
    showCompany?: boolean
    canCreate?: boolean
  }>(),
  {
    stateFilter: '',
    companyId: '',
    companyOptions: () => [],
    showCompany: false,
    canCreate: true,
  }
)

const emit = defineEmits<{
  (event: 'update:stateFilter', value: string): void
  (event: 'update:companyId', value: string): void
  (event: 'create'): void
}>()

const { t } = useI18n()

const hasActiveFilters = computed(() => props.stateFilter !== '')

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

  if (!state) {
    return []
  }

  return [
    {
      key: 'state',
      label: state.label,
      onRemove: () => emit('update:stateFilter', ''),
    },
  ]
})

// La compagnie n'est pas un filtre : c'est le contexte de l'écran, on ne la réinitialise pas.
function resetFilters(): void {
  emit('update:stateFilter', '')
}
</script>

<style scoped>
.games-toolbar__filters {
  display: grid;
  grid-template-columns: minmax(180px, 220px);
  align-items: end;
  gap: 12px;
  width: 100%;
  min-width: 0;
}

.games-toolbar__filters--company {
  grid-template-columns: minmax(220px, 280px) minmax(180px, 220px);
}

.games-toolbar__filters :deep(select),
.games-toolbar__filters :deep(.select-field__trigger) {
  box-sizing: border-box;
  width: 100%;
  height: 46px;
  min-height: 46px;
}

@media (max-width: 700px) {
  .games-toolbar__filters,
  .games-toolbar__filters--company {
    grid-template-columns: 1fr;
  }
}
</style>
