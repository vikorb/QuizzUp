<template>
  <BaseCard :neon="false" :no-hover="true">
    <div class="filters">
      <div class="filters__left">
        <FormField
          id="q"
          :model-value="modelValue"
          :label="$t('clients.filters.searchLabel')"
          :placeholder="$t('clients.filters.searchPlaceholder')"
          inputmode="search"
          autocomplete="off"
          :neon="false"
          @update:model-value="$emit('update:modelValue', $event)"
        />
      </div>

      <div class="filters__status">
        <SelectField
          id="status-filter"
          :model-value="statusFilter"
          :label="$t('clients.filters.statusLabel')"
          :options="statusOptions"
          @update:model-value="handleStatusChange"
        />
      </div>

      <div class="filters__right">
        <UiButton variant="primary" type="button" @click="handleCreateCompany">
          {{ $t('clients.actions.addCompany') }}
        </UiButton>
      </div>
    </div>
  </BaseCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import BaseCard from '@/components/ui/BaseCard.vue'
import FormField from '@/components/ui/form/FormField.vue'
import type { SelectFieldOption } from '@/components/ui/form/SelectField.vue'
import SelectField from '@/components/ui/form/SelectField.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { getCreateCompanyRoute } from '@/router/clients'

type ClientStatusFilter = 'active' | 'inactive' | 'all'

const props = withDefaults(
  defineProps<{
    modelValue: string
    statusFilter?: ClientStatusFilter
  }>(),
  {
    statusFilter: 'active',
  }
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'update:statusFilter', value: ClientStatusFilter): void
}>()

const router = useRouter()
const { t } = useI18n()

const statusOptions = computed<SelectFieldOption[]>(() => [
  {
    label: String(t('clients.filters.statusOptions.active')),
    value: 'active',
  },
  {
    label: String(t('clients.filters.statusOptions.inactive')),
    value: 'inactive',
  },
  {
    label: String(t('clients.filters.statusOptions.all')),
    value: 'all',
  },
])

function handleCreateCompany(): void {
  router.push(getCreateCompanyRoute())
}

function handleStatusChange(value: string): void {
  if (value === 'active' || value === 'inactive' || value === 'all') {
    emit('update:statusFilter', value)
    return
  }

  emit('update:statusFilter', props.statusFilter)
}
</script>

<style scoped>
.filters {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
}

.filters__left {
  flex: 1 1 auto;
  min-width: 0;
}

.filters__status {
  flex: 0 0 220px;
}

.filters__right {
  flex: 0 0 auto;
}

@media (max-width: 980px) {
  .filters {
    flex-direction: column;
    align-items: stretch;
  }

  .filters__status {
    flex: 1 1 auto;
  }

  .filters__right :deep(.ui-btn) {
    width: 100%;
  }
}
</style>
