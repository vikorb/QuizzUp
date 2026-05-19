<template>
  <div class="actions">
    <AccountTableActionsSwitch
      :company-id="props.companyId"
      :account="props.item"
      :disabled="deleteBusy"
      @updated="handleAccountUpdated"
      @error="handleActionError"
      @busy-change="handleSwitchBusyChange"
    />

    <UiButton
      class="icon"
      variant="icon"
      type="button"
      :disabled="isBusy || isDeleted"
      :title="$t('accounts.table.actions.edit')"
      :aria-label="$t('accounts.table.actions.edit')"
      @click="handleEditAccount(props.item.id)"
    >
      <MdIcon :path="mdiPencilOutline" :size="18" />
    </UiButton>

    <UiButton
      class="icon icon-delete"
      variant="icon"
      type="button"
      :disabled="isBusy || isDeleted"
      :title="$t('accounts.table.actions.delete')"
      :aria-label="$t('accounts.table.actions.delete')"
      @click="handleDeleteAccount"
    >
      <MdIcon :path="mdiDeleteOutline" :size="18" />
    </UiButton>
  </div>
</template>

<script setup lang="ts">
import { mdiDeleteOutline, mdiPencilOutline } from '@mdi/js'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { getEditCompanyAccountRoute } from '@/router/clients'
import { deleteAccountService } from '@/services/accountsService'
import type { Account, AccountTableRow } from '@/types/account'
import { isAccountDeleted } from '@/utils/account/status'

import AccountTableActionsSwitch from './AccountTableActionsSwitch.vue'

const props = defineProps<{
  companyId: number
  item: AccountTableRow
}>()

const emit = defineEmits<{
  (event: 'edit', accountId: number): void
  (event: 'updated', account: Account): void
  (event: 'deleted', accountId: number): void
  (event: 'error', errorCode: string): void
}>()

const { t } = useI18n()
const router = useRouter()
const deleteBusy = ref(false)
const switchBusy = ref(false)

const isBusy = computed(() => deleteBusy.value || switchBusy.value)
const isDeleted = computed(() => isAccountDeleted(props.item.status))

function handleSwitchBusyChange(value: boolean): void {
  switchBusy.value = value
}

function handleAccountUpdated(updatedAccount: Account): void {
  emit('updated', updatedAccount)
}

function handleActionError(errorCode: string): void {
  emit('error', errorCode)
}

function handleEditAccount(accountId: number): void {
  router.push(getEditCompanyAccountRoute(props.companyId, accountId))
}

async function handleDeleteAccount(): Promise<void> {
  if (isBusy.value || isDeleted.value) {
    return
  }

  const confirmed = window.confirm(
    t('accounts.table.actions.deleteConfirm', {
      name: props.item.displayName,
    }),
  )

  if (!confirmed) {
    return
  }

  deleteBusy.value = true

  try {
    const result = await deleteAccountService(props.companyId, props.item.id)

    if (!result.ok) {
      emit('error', result.error)
      return
    }

    emit('updated', result.data.account)
    emit('deleted', props.item.id)
  } finally {
    deleteBusy.value = false
  }
}
</script>

<style scoped>
.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  white-space: nowrap;
}

.icon-delete {
  color: #ff6b6b;
}
</style>
