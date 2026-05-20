<template>
  <div class="client-switch">
    <SwitchField
      :model-value="isActive"
      :disabled="isSwitchDisabled"
      :label="switchTitle"
      @change="toggleStatus"
    />
  </div>
</template>

<script setup lang="ts">
import {
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_DELETED,
  COMPANY_STATUS_INACTIVE,
  type CompanyStatus,
} from '@quizzup/shared'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import SwitchField from '@/components/ui/form/SwitchField.vue'
import { updateCompanyStatusService } from '@/services/companiesService'
import type { CompanyTableRow } from '@/types/company'
import { toCompanyStatus } from '@/utils/company/status'

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
const busy = ref(false)

const currentStatus = computed<CompanyStatus>(
  () => toCompanyStatus(props.company.status) ?? COMPANY_STATUS_INACTIVE,
)

const isActive = computed(() => currentStatus.value === COMPANY_STATUS_ACTIVE)
const isDeleted = computed(() => currentStatus.value === COMPANY_STATUS_DELETED)
const isSwitchDisabled = computed(() => props.disabled || busy.value || isDeleted.value)

const switchTitle = computed(() =>
  isActive.value ? t('clients.table.actions.disable') : t('clients.table.actions.enable'),
)

function setBusy(value: boolean): void {
  busy.value = value
  emit('busy-change', value)
}

async function toggleStatus(): Promise<void> {
  if (isSwitchDisabled.value) {
    return
  }

  const nextStatus = isActive.value ? COMPANY_STATUS_INACTIVE : COMPANY_STATUS_ACTIVE

  const confirmKey = isActive.value
    ? 'clients.table.actions.disableConfirm'
    : 'clients.table.actions.enableConfirm'

  const confirmed = window.confirm(
    t(confirmKey, {
      name: props.company.name,
    }),
  )

  if (!confirmed) {
    return
  }

  setBusy(true)

  try {
    const result = await updateCompanyStatusService(props.company.id, nextStatus)

    if (!result.ok) {
      emit('error', result.error)
      return
    }

    const updatedCompany: CompanyTableRow = {
      ...props.company,
      ...result.company,
      status: nextStatus,
    }

    emit('updated', updatedCompany)
  } finally {
    setBusy(false)
  }
}
</script>

<style scoped>
.client-switch {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
