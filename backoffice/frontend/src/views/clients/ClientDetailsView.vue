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
        <UiButton variant="default" type="button" :disabled="companySaving" @click="goBack">
          {{ $t('clients.details.actions.back') }}
        </UiButton>
      </template>

      <ClientDetailForm
        v-if="company"
        :name="form.name"
        :email="form.email"
        :status="form.status"
        :original-status="company.status"
        :field-errors="fieldErrors"
        :company-saving="companySaving"
        :is-company-readonly="isCompanyReadonly"
        :can-manage-company="canManageCompany"
        :can-show-status-switch="canShowStatusSwitch"
        :has-company-changes="hasCompanyChanges"
        :form-error="formError"
        :form-success="formSuccess"
        @update:name="form.name = $event"
        @update:email="form.email = $event"
        @toggle-status="toggleCompanyStatus"
        @reset="resetCompanyForm"
        @submit="saveCompany"
      />
    </BaseCard>

    <ClientDetailAccountsSection
      :company-id="companyId"
      :can-show-accounts-section="canShowAccountsSection"
    />
  </SectionLayout>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import SectionLayout from '@/components/SectionLayout.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { loadCompanyDetailsService, updateCompanyService } from '@/services/companiesService'
import { me } from '@/state/authState'
import type { Company, EditCompanyFieldErrors } from '@/types/company'
import {
  createCompanyDetailsForm,
  getCompanyDetailsFormValues,
  hasCompanyDetailsChanges,
} from '@/utils/company/details/form'
import {
  canManageCompanyDetails,
  canShowCompanyAccountsSection,
  canShowCompanyStatusSwitch,
  isCompanyDetailsReadonly,
  isSuperadminRole,
} from '@/utils/company/details/permissions'
import { getNextCompanyStatus } from '@/utils/company/details/status'
import {
  buildUpdateCompanyPayload,
  createEditCompanyFieldErrors,
  getEditCompanyApiFieldError,
  getEditCompanyApiFormError,
  hasEditCompanyFormErrors,
  validateEditCompanyForm,
} from '@/utils/company/edit'
import { clearTimer, scheduleTimer, type TimerHandle } from '@/utils/timer'

import ClientDetailAccountsSection from './details/account/ClientDetailAccountsSection.vue'
import ClientDetailForm from './details/ClientDetailForm.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const companyId = Number(route.params.id)

const company = ref<Company | null>(null)

const companyLoading = ref(false)
const companySaving = ref(false)

const companyErrorCode = ref<string | null>(null)

const formError = ref<string | null>(null)
const formSuccess = ref<string | null>(null)
const formSuccessTimer = ref<TimerHandle | null>(null)

const fieldErrors = reactive<EditCompanyFieldErrors>(createEditCompanyFieldErrors())
const form = reactive(createCompanyDetailsForm())

const currentRole = computed(() => me.value?.role ?? null)

const isSuperadmin = computed(() => isSuperadminRole(currentRole.value))
const canManageCompany = computed(() => canManageCompanyDetails(currentRole.value))
const canShowStatusSwitch = computed(() => canShowCompanyStatusSwitch(currentRole.value))
const canShowAccountsSection = computed(() => canShowCompanyAccountsSection(currentRole.value))
const isCompanyReadonly = computed(() => isCompanyDetailsReadonly(currentRole.value))

const hasCompanyChanges = computed(() =>
  hasCompanyDetailsChanges(form, company.value, canManageCompany.value),
)

function dismissFormSuccessLater(): void {
  formSuccessTimer.value = scheduleTimer(formSuccessTimer.value, () => {
    formSuccess.value = null
    formSuccessTimer.value = null
  })
}

function resetFormMessages(): void {
  formSuccessTimer.value = clearTimer(formSuccessTimer.value)
  formError.value = null
  formSuccess.value = null
  Object.assign(fieldErrors, createEditCompanyFieldErrors())
}

function resetCompanyForm(): void {
  if (!company.value || !canManageCompany.value) {
    return
  }

  resetFormMessages()
  Object.assign(form, getCompanyDetailsFormValues(company.value))
}

function validateCompanyForm(): boolean {
  const errors = validateEditCompanyForm(form, t)

  Object.assign(fieldErrors, errors)

  return !hasEditCompanyFormErrors(errors)
}

function toggleCompanyStatus(): void {
  if (!canShowStatusSwitch.value) {
    return
  }

  formSuccessTimer.value = clearTimer(formSuccessTimer.value)
  formSuccess.value = null
  form.status = getNextCompanyStatus(form.status)
}

async function saveCompany(): Promise<void> {
  if (!canManageCompany.value || companySaving.value || !hasCompanyChanges.value) {
    return
  }

  resetFormMessages()

  if (!validateCompanyForm()) {
    return
  }

  companySaving.value = true

  try {
    const result = await updateCompanyService(companyId, buildUpdateCompanyPayload(form))

    if (!result.ok) {
      const apiFieldError = getEditCompanyApiFieldError(result.error, t)

      if (apiFieldError) {
        fieldErrors[apiFieldError.field] = apiFieldError.message
        return
      }

      formError.value = getEditCompanyApiFormError(result.error, t)
      return
    }

    company.value = result.data.company
    Object.assign(form, getCompanyDetailsFormValues(result.data.company))
    formSuccess.value = t('clients.details.form.success.updated')
    dismissFormSuccessLater()
  } finally {
    companySaving.value = false
  }
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
    Object.assign(form, getCompanyDetailsFormValues(result.data.company))
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

onBeforeUnmount(() => {
  formSuccessTimer.value = clearTimer(formSuccessTimer.value)
})

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
