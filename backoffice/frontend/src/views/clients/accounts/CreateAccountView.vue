<template>
  <SectionLayout :title="pageTitle" :subtitle="pageSubtitle">
    <BaseCard
      :title="cardTitle"
      :neon="true"
      :no-hover="true"
      :loading="loadingAccount"
      :error="accountError"
      error-namespace="accounts.errors"
      class="account-form-card"
    >
      <template #actions>
        <UiButton variant="default" type="button" @click="goBack">
          {{ $t('accounts.form.actions.cancel') }}
        </UiButton>
      </template>

      <CreateAccountForm
        v-if="canRenderForm"
        :mode="mode"
        :company-id="companyId"
        :account="account"
        :loading-account="loadingAccount"
      />
    </BaseCard>
  </SectionLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import SectionLayout from '@/components/SectionLayout.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { getCompanyAccountsRoute } from '@/router/clients'
import { loadCompanyAccountService } from '@/services/accountsService'
import type { Account } from '@/types/account'

import CreateAccountForm from './createAccount/CreateAccountForm.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const companyId = Number(route.params.companyId)
const accountId = computed(() => Number(route.params.accountId))
const mode = computed<'create' | 'edit'>(() => (route.name === 'company-account-edit' ? 'edit' : 'create'))

const account = ref<Account | null>(null)
const loadingAccount = ref(false)
const accountError = ref<string | null>(null)

const isEditMode = computed(() => mode.value === 'edit')

const pageTitle = computed(() =>
  isEditMode.value ? t('accounts.edit.title') : t('accounts.create.title'),
)

const pageSubtitle = computed(() =>
  isEditMode.value ? t('accounts.edit.subtitle') : t('accounts.create.subtitle'),
)

const cardTitle = computed(() =>
  isEditMode.value ? t('accounts.edit.cardTitle') : t('accounts.create.cardTitle'),
)

const canRenderForm = computed(() => {
  if (!Number.isFinite(companyId)) {
    return false
  }

  if (mode.value === 'create') {
    return true
  }

  return Boolean(account.value) && !loadingAccount.value && !accountError.value
})

async function loadAccount(): Promise<void> {
  if (mode.value !== 'edit') {
    return
  }

  if (!Number.isFinite(companyId) || !Number.isFinite(accountId.value)) {
    accountError.value = 'invalid_params'
    return
  }

  loadingAccount.value = true
  accountError.value = null

  try {
    const result = await loadCompanyAccountService(companyId, accountId.value)

    if (!result.ok) {
      accountError.value = result.error
      account.value = null
      return
    }

    account.value = result.data.account
  } finally {
    loadingAccount.value = false
  }
}

function goBack(): void {
  router.push(getCompanyAccountsRoute(companyId))
}

onMounted(() => {
  if (!Number.isFinite(companyId)) {
    accountError.value = 'invalid_params'
    return
  }

  loadAccount()
})
</script>

<style scoped>
.account-form-card {
  margin-top: 10px;
}
</style>
