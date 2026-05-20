<template>
  <SectionLayout :title="pageTexts.pageTitle" :subtitle="pageTexts.pageSubtitle">
    <BaseCard
      :title="pageTexts.cardTitle"
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
        :mode="pageContext.mode"
        :company-id="pageContext.companyId"
        :account="account"
        :loading-account="loadingAccount"
        :profile-mode="pageContext.isProfileRoute"
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
import { loadCompanyAccountService } from '@/services/accountsService'
import { me } from '@/state/authState'
import type { Account } from '@/types/account'
import {
  canRenderAccountForm,
  getAccountFormBackRoute,
  getAccountFormPageContext,
  getAccountFormPageTexts,
  getAccountFormParamsError,
} from '@/utils/account/form'

import CreateAccountForm from './createAccount/CreateAccountForm.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const account = ref<Account | null>(null)
const loadingAccount = ref(false)
const accountError = ref<string | null>(null)

const pageContext = computed(() => getAccountFormPageContext(route, me.value))

const pageTexts = computed(() => getAccountFormPageTexts(pageContext.value, t))

const canRenderForm = computed(() =>
  canRenderAccountForm(
    pageContext.value,
    account.value,
    loadingAccount.value,
    accountError.value,
  ),
)

async function loadAccount(): Promise<void> {
  const paramsError = getAccountFormParamsError(pageContext.value)

  if (paramsError) {
    accountError.value = paramsError
    account.value = null
    return
  }

  if (pageContext.value.mode !== 'edit') {
    return
  }

  loadingAccount.value = true
  accountError.value = null

  try {
    const result = await loadCompanyAccountService(
      pageContext.value.companyId,
      pageContext.value.accountId,
    )

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
  router.push(getAccountFormBackRoute(pageContext.value))
}

onMounted(() => {
  loadAccount()
})
</script>

<style scoped>
.account-form-card {
  margin-top: 10px;
}
</style>
