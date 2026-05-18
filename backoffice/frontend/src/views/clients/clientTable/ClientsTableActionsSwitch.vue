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
import type { CompanyStatus } from '@quizzup/shared'
import {
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_DELETED,
  COMPANY_STATUS_INACTIVE,
} from '@quizzup/shared'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import SwitchField from '@/components/ui/form/SwitchField.vue'
import { updateCompanyStatusService } from '@/services/companiesService'
import type { CompanyTableRow } from '@/types/company'
import { getNextCompanySwitchStatus, toCompanyStatus } from '@/utils/company/status'
import { waitForPaint } from '@/utils/dom'

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
const displayedStatus = ref<CompanyStatus>(
  toCompanyStatus(props.company.status) ?? COMPANY_STATUS_INACTIVE,
)
const isActive = computed(() => displayedStatus.value === COMPANY_STATUS_ACTIVE)
const isDeleted = computed(() => displayedStatus.value === COMPANY_STATUS_DELETED)

const toggleStatusLabel = computed(() =>
  isActive.value
    ? t('clients.table.actions.active')
    : t('clients.table.actions.inactive'),
)

watch(
  () => props.company.status,
  (status) => {
    if (!isBusy.value) {
      displayedStatus.value = toCompanyStatus(status) ?? COMPANY_STATUS_INACTIVE
    }
  },
)

function setBusy(value: boolean): void {
  isBusy.value = value
  emit('busy-change', value)
}

function getConfirmMessage(): string {
  const key = isActive.value
    ? 'clients.table.actions.deactivateConfirm'
    : 'clients.table.actions.reactivateConfirm'

  return String(
    t(key, {
      name: props.company.name,
    }),
  )
}

function rollbackStatus(status: CompanyStatus): void {
  displayedStatus.value = status
}

function emitUpdatedCompany(company: CompanyTableRow): void {
  emit('updated', company)
}

async function handleToggleStatus(): Promise<void> {
  if (isBusy.value || props.disabled || isDeleted.value) {
    return
  }

  const previousStatus = displayedStatus.value
  const nextStatus = getNextCompanySwitchStatus(isActive.value)
  const confirmMessage = getConfirmMessage()

  displayedStatus.value = nextStatus

  await waitForPaint()

  const confirmed = window.confirm(confirmMessage)

  if (!confirmed) {
    rollbackStatus(previousStatus)
    return
  }

  setBusy(true)

  try {
    const result = await updateCompanyStatusService(props.company.id, nextStatus)

    if (!result.ok) {
      rollbackStatus(previousStatus)
      emit('error', result.error)
      return
    }

    const updatedCompany: CompanyTableRow = {
      ...props.company,
      ...result.company,
      status: nextStatus,
    }

    displayedStatus.value = nextStatus
    emitUpdatedCompany(updatedCompany)
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
