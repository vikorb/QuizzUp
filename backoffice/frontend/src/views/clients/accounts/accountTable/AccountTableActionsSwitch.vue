<template>
  <button
    class="switch"
    :class="{ 'switch--active': isActive }"
    type="button"
    role="switch"
    :aria-checked="isActive"
    :disabled="disabled || busy || isDeleted"
    :title="switchTitle"
    @click="toggleStatus"
  >
    <span class="switch__thumb" />
  </button>
</template>

<script setup lang="ts">
import { ADMIN_STATUS_ACTIVE, ADMIN_STATUS_INACTIVE } from '@quizzup/shared'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

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

async function toggleStatus(): Promise<void> {
  if (props.disabled || busy.value || isDeleted.value) {
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

  busy.value = true
  emit('busy-change', true)

  try {
    const result = await updateAccountStatusService(props.companyId, props.account.id, nextStatus)

    if (!result.ok) {
      emit('error', result.error)
      return
    }

    emit('updated', result.data.account)
  } finally {
    busy.value = false
    emit('busy-change', false)
  }
}
</script>

<style scoped>
.switch {
  position: relative;
  width: 38px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    opacity 0.2s ease;
}

.switch:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.switch--active {
  border-color: rgba(45, 255, 137, 0.45);
  background: rgba(45, 255, 137, 0.22);
}

.switch__thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: var(--text-0);
  transition: transform 0.2s ease;
}

.switch--active .switch__thumb {
  transform: translateX(16px);
}
</style>  
