<template>
  <BaseToolBar
    :title="$t('players.filters.title')"
    :reset-label="$t('resetFilters')"
    :reset-icon="mdiRefresh"
    :reset-disabled="search === ''"
    :active-filters="activeFilters"
    @reset="$emit('update:search', '')"
  >
    <template v-if="canExport" #actions>
      <UiButton
        variant="default"
        type="button"
        data-test="players-export"
        :disabled="exporting"
        @click="$emit('export')"
      >
        <span class="players-toolbar__button">
          <MdIcon :path="mdiDownload" :size="18" />
          <span>{{ $t('players.actions.export') }}</span>
        </span>
      </UiButton>
    </template>

    <div
      class="players-toolbar__filters"
      :class="{ 'players-toolbar__filters--company': showCompany }"
    >
      <SelectField
        v-if="showCompany"
        id="players-company-filter"
        :model-value="companyId"
        :label="$t('players.filters.company')"
        :options="companyOptions"
        @update:model-value="$emit('update:companyId', $event)"
      />

      <FormField
        id="players-search-filter"
        :model-value="search"
        :label="$t('players.filters.search')"
        :placeholder="$t('players.filters.searchPlaceholder')"
        inputmode="search"
        autocomplete="off"
        :neon="false"
        @update:model-value="$emit('update:search', $event)"
      />
    </div>
  </BaseToolBar>
</template>

<script setup lang="ts">
import { mdiDownload, mdiRefresh } from '@mdi/js'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseToolBar, { type ActiveFilter } from '@/components/ui/BaseToolBar.vue'
import FormField from '@/components/ui/form/FormField.vue'
import SelectField from '@/components/ui/form/SelectField.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { SelectFieldOption } from '@/types/form'

const props = withDefaults(
  defineProps<{
    search?: string
    companyId?: string
    companyOptions?: SelectFieldOption[]
    showCompany?: boolean
    /** Export des adresses : admin et superadmin seulement. */
    canExport?: boolean
    exporting?: boolean
  }>(),
  {
    search: '',
    companyId: '',
    companyOptions: () => [],
    showCompany: false,
    canExport: false,
    exporting: false,
  }
)

const emit = defineEmits<{
  (event: 'update:search', value: string): void
  (event: 'update:companyId', value: string): void
  (event: 'export'): void
}>()

const { t } = useI18n()

const activeFilters = computed<ActiveFilter[]>(() =>
  props.search === ''
    ? []
    : [
        {
          key: 'search',
          label: `${t('players.filters.search')} : ${props.search}`,
          onRemove: () => emit('update:search', ''),
        },
      ]
)
</script>

<style scoped>
.players-toolbar__filters {
  display: grid;
  grid-template-columns: minmax(0, 360px);
  align-items: end;
  gap: 12px;
  width: 100%;
  min-width: 0;
}

.players-toolbar__filters--company {
  grid-template-columns: minmax(220px, 280px) minmax(0, 360px);
}

.players-toolbar__button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* Cibles de 48 px : la liste déroulante et le champ de recherche ont la même hauteur. */
.players-toolbar__filters :deep(select),
.players-toolbar__filters :deep(.select-field__trigger),
.players-toolbar__filters :deep(.ff__control) {
  box-sizing: border-box;
  width: 100%;
  height: 48px;
  min-height: 48px;
}

@media (max-width: 700px) {
  .players-toolbar__filters,
  .players-toolbar__filters--company {
    grid-template-columns: 1fr;
  }
}
</style>
