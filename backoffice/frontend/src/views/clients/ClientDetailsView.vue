<template>
  <SectionLayout :title="$t('clients.details.title')" :subtitle="$t('clients.details.subtitle')">
    <BaseCard
      id="company-info"
      :title="$t('clients.details.card.title')"
      :neon="true"
      :no-hover="true"
      :loading="companyLoading"
      :error="companyErrorCode"
      error-namespace="clients.details.errors"
      class="company-details-card"
    >
      <template #actions>
        <UiButton variant="default" type="button" :disabled="companyLoading" @click="goBack">
          {{ $t('clients.details.actions.back') }}
        </UiButton>
      </template>

      <ClientDetailForm
        v-if="company"
        :company="company"
        @updated="handleCompanyUpdated"
      />
    </BaseCard>

    <ClientDetailAccountsSection
      :company-id="companyId"
      :can-show-accounts-section="canShowAccountsSection"
    />
  </SectionLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import SectionLayout from '@/components/SectionLayout.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { loadCompanyDetailsService } from '@/services/companiesService'
import { me } from '@/state/authState'
import type { Company } from '@/types/company'
import {
  canShowCompanyAccountsSection,
  isSuperadminRole,
} from '@/utils/company/details/permissions'

import ClientDetailAccountsSection from './details/account/ClientDetailAccountsSection.vue'
import ClientDetailForm from './details/ClientDetailForm.vue'

const route = useRoute()
const router = useRouter()
const companyId = Number(route.params.id)
const company = ref<Company | null>(null)
const companyLoading = ref(false)
const companyErrorCode = ref<string | null>(null)
const currentRole = computed(() => me.value?.role ?? null)
const isSuperadmin = computed(() => isSuperadminRole(currentRole.value))

const canShowAccountsSection = computed(() =>
  canShowCompanyAccountsSection(currentRole.value),
)

function handleCompanyUpdated(updatedCompany: Company): void {
  company.value = updatedCompany
}

async function loadCompany(): Promise<void> {
  companyErrorCode.value = null
  companyLoading.value = true

  try {
    const result = await loadCompanyDetailsService(companyId)

    if (!result.ok) {
      companyErrorCode.value = result.error
      company.value = null
      return
    }

    company.value = result.data.company
  } finally {
    companyLoading.value = false
  }
}

function goBack(): void {
  if (isSuperadmin.value) {
    router.push('/clients')
    return
  }

  router.push('/')
}

onMounted(() => {
  if (!Number.isFinite(companyId)) {
    companyErrorCode.value = 'invalid_params'
    return
  }

  loadCompany()
})
</script>

<style scoped>
.company-details-card {
  margin-bottom: 18px;
  scroll-margin-top: 90px;
}
</style>
