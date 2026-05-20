<template>
  <div v-if="canShowAccountsSection" id="accounts" class="accounts-section">
    <AccountsToolBar
      v-model="searchQuery"
      v-model:status-filter="statusFilter"
      @create="handleCreateAccount"
    />

    <BaseBanner
      :variant="actionBannerVariant"
      :message="actionBannerMessage"
      @dismiss="clearActionBanner"
    />

    <AccountsTable
      :company-id="companyId"
      :accounts="filteredAccounts"
      :loading="accountsLoading"
      :error="accountsErrorCode"
      @updated="handleAccountUpdated"
      @deleted="handleAccountDeleted"
      @edit="handleEditAccount"
      @error="handleTableError"
      @retry="loadAccounts"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import BaseBanner from '@/components/ui/BaseBanner.vue'
import { getCreateCompanyAccountRoute, getEditCompanyAccountRoute } from '@/router/clients'
import { loadCompanyAccountsService } from '@/services/accountsService'
import type { Account, AccountStatusFilter } from '@/types/account'
import type { ActionBanner } from '@/types/banner'
import type { TimerHandle } from '@/types/timer'
import { createAccountDeletedBanner, createAccountUpdatedBanner } from '@/utils/account/detailsBanner'
import { DEFAULT_ACCOUNT_STATUS_FILTER, filterAccounts, filterAccountsByStatus } from '@/utils/account/filters'
import { updateAccountInList } from '@/utils/account/list'
import { createErrorBanner, getBannerMessage, getBannerVariant } from '@/utils/banner'
import { clearTimer, scheduleTimer } from '@/utils/timer'

import AccountsTable from '../../accounts/AccountsTable.vue'
import AccountsToolBar from '../../accounts/AccountsToolBar.vue'

const props = defineProps<{
  companyId: number
  canShowAccountsSection: boolean
}>()

const { t } = useI18n()
const router = useRouter()
const accounts = ref<Account[]>([])
const accountsLoading = ref(false)
const accountsErrorCode = ref<string | null>(null)
const searchQuery = ref('')
const statusFilter = ref<AccountStatusFilter>(DEFAULT_ACCOUNT_STATUS_FILTER)
const actionBanner = ref<ActionBanner | null>(null)
const actionBannerTimer = ref<TimerHandle | null>(null)
const actionBannerVariant = computed(() => getBannerVariant(actionBanner.value))
const actionBannerMessage = computed(() => getBannerMessage(actionBanner.value, t))

const filteredAccounts = computed(() => {
  if (!props.canShowAccountsSection) {
    return []
  }

  const searchedAccounts = filterAccounts(accounts.value, searchQuery.value)

  return filterAccountsByStatus(searchedAccounts, statusFilter.value)
})

function dismissActionBannerLater(): void {
  actionBannerTimer.value = scheduleTimer(actionBannerTimer.value, () => {
    actionBanner.value = null
    actionBannerTimer.value = null
  })
}

function clearActionBanner(): void {
  actionBannerTimer.value = clearTimer(actionBannerTimer.value)
  actionBanner.value = null
}

async function loadAccounts(): Promise<void> {
  if (!props.canShowAccountsSection) {
    accounts.value = []
    accountsErrorCode.value = null
    return
  }

  if (!Number.isFinite(props.companyId)) {
    accounts.value = []
    accountsErrorCode.value = 'invalid_params'
    return
  }

  accountsErrorCode.value = null
  clearActionBanner()
  accountsLoading.value = true

  try {
    const result = await loadCompanyAccountsService(props.companyId)

    if (!props.canShowAccountsSection) {
      accounts.value = []
      accountsErrorCode.value = null
      return
    }

    if (!result.ok) {
      accountsErrorCode.value = result.error
      accounts.value = []
      return
    }

    accounts.value = result.data.accounts
  } finally {
    accountsLoading.value = false
  }
}

function handleAccountUpdated(updatedAccount: Account): void {
  if (!props.canShowAccountsSection) {
    return
  }

  clearActionBanner()
  actionBanner.value = createAccountUpdatedBanner(accounts.value, updatedAccount)
  accounts.value = updateAccountInList(accounts.value, updatedAccount)
  dismissActionBannerLater()
}

function handleAccountDeleted(accountId: number): void {
  if (!props.canShowAccountsSection) {
    return
  }

  clearActionBanner()
  actionBanner.value = createAccountDeletedBanner(accounts.value, accountId)
  dismissActionBannerLater()
}

function handleTableError(error: string): void {
  if (!props.canShowAccountsSection) {
    return
  }

  actionBannerTimer.value = clearTimer(actionBannerTimer.value)
  actionBanner.value = createErrorBanner(error)
}

function handleCreateAccount(): void {
  if (!props.canShowAccountsSection) {
    return
  }

  router.push(getCreateCompanyAccountRoute(props.companyId))
}

function handleEditAccount(accountId: number): void {
  if (!props.canShowAccountsSection) {
    return
  }

  router.push(getEditCompanyAccountRoute(props.companyId, accountId))
}

watch(
  () => [props.canShowAccountsSection, props.companyId] as const,
  ([canShowAccounts]) => {
    if (!canShowAccounts) {
      accounts.value = []
      accountsErrorCode.value = null
      clearActionBanner()
      return
    }

    loadAccounts()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  actionBannerTimer.value = clearTimer(actionBannerTimer.value)
})
</script>

<style scoped>
.accounts-section {
  scroll-margin-top: 90px;
}
</style>
