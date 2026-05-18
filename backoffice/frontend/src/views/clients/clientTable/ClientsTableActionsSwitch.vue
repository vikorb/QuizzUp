<template>
  <div class="clients-table-actions-switch">
    <SwitchField
      :model-value="isActive"
      :disabled="disabled || isBusy || isDeleted"
      :label="toggleStatusLabel"
      @change="handleToggleStatus"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import SwitchField from '@/components/ui/form/SwitchField.vue'
import { COMPANY_STATUS_ACTIVE, COMPANY_STATUS_DELETED, COMPANY_STATUS_INACTIVE } from '@/CONSTANTS'
import type { CompanySwitchStatus, CompanyTableRow } from '@/types/company'
import { apiRequestJson } from '@/utils/api'

type UpdateCompanyStatusResponse = {
  company: CompanyTableRow
}

const props = withDefaults(
  defineProps<{
    company: CompanyTableRow
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const emit = defineEmits<{
  (event: 'updated', company: CompanyTableRow): void
  (event: 'error', errorCode: string): void
  (event: 'busy-change', value: boolean): void
}>()

const { t } = useI18n()

const isBusy = ref(false)

const isActive = computed(() => props.company.status === COMPANY_STATUS_ACTIVE)

const isDeleted = computed(() => props.company.status === COMPANY_STATUS_DELETED)

const toggleStatusLabel = computed(() =>
  isActive.value
    ? t('clients.table.actions.active')
    : t('clients.table.actions.inactive'),
)

function setBusy(value: boolean): void {
  isBusy.value = value
  emit('busy-change', value)
}

async function handleToggleStatus(nextChecked: boolean): Promise<void> {
  if (isBusy.value || props.disabled || isDeleted.value) {
    return
  }

  const nextStatus: CompanySwitchStatus = nextChecked
    ? COMPANY_STATUS_ACTIVE
    : COMPANY_STATUS_INACTIVE

  if (nextStatus === COMPANY_STATUS_INACTIVE) {
    const confirmed = window.confirm(
      t('clients.table.actions.deactivateConfirm', {
        name: props.company.name,
      }),
    )

    if (!confirmed) {
      return
    }
  }

  setBusy(true)

  try {
    const result = await apiRequestJson<UpdateCompanyStatusResponse>({
      path: `/companies/${props.company.id}/status`,
      method: 'PATCH',
      authenticated: true,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: nextStatus,
      }),
    })

    if (!result.ok) {
      emit('error', result.error)
      return
    }

    emit('updated', result.data.company)
  } finally {
    setBusy(false)
  }
}
</script>

<style scoped>
.clients-table-actions-switch {
  margin-left: 8px;
}
</style>
