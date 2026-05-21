<template>
  <SwitchField
    :model-value="isActive"
    :disabled="isSwitchDisabled"
    :label="switchTitle"
    @change="toggleStatus"
  />
</template>

<script setup lang="ts">
import { ADMIN_STATUS_ACTIVE, ADMIN_STATUS_INACTIVE } from '@quizzup/shared'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import SwitchField from '@/components/ui/form/SwitchField.vue'
import { updateAccountStatusService } from '@/services/accountsService'
import type { Account, AccountTableRow } from '@/types/account'
import { isAccountActive, isAccountDeleted } from '@/utils/account/status'

const props = defineProps<{
  companyId: number
  account: AccountTableRow
  disabled?: boolean
}>()

const emit = defineEmits<{
  (event: 'updated', account: Account): void
  (event: 'error', errorCode: string): void
  (event: 'busy-change', value: boolean): void
}>()

const { t } = useI18n()
const busy = ref(false)
const isActive = computed(() => isAccountActive(props.account.status))
const isDeleted = computed(() => isAccountDeleted(props.account.status))
const isSwitchDisabled = computed(() => props.disabled || busy.value || isDeleted.value)

const accountName = computed(() => {
  return (
    props.account.displayName ||
    [props.account.firstname, props.account.lastname].filter(Boolean).join(' ').trim() ||
    props.account.username ||
    `#${props.account.id}`
  )
})

const switchTitle = computed(() =>
  isActive.value ? t('accounts.table.actions.disable') : t('accounts.table.actions.enable'),
)

function setBusy(value: boolean): void {
  busy.value = value
  emit('busy-change', value)
}

async function toggleStatus(): Promise<void> {
  if (isSwitchDisabled.value) {
    return
  }

  const nextStatus = isActive.value ? ADMIN_STATUS_INACTIVE : ADMIN_STATUS_ACTIVE

  const confirmKey = isActive.value
    ? 'accounts.table.actions.disableConfirm'
    : 'accounts.table.actions.enableConfirm'

  const confirmed = window.confirm(
    t(confirmKey, {
      name: accountName.value,
    }),
  )

  if (!confirmed) {
    return
  }

  setBusy(true)

  try {
    const result = await updateAccountStatusService(props.companyId, props.account.id, nextStatus)

    if (!result.ok) {
      emit('error', result.error)
      return
    }

    emit('updated', result.data.account)
  } finally {
    setBusy(false)
  }
}
</script>
