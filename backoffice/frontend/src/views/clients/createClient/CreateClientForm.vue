<template>
  <form class="create-client-form" @submit.prevent="onSubmit">
    <FormField
      v-model="name"
      :label="$t('clients.create.fields.name.label')"
      name="name"
      autocomplete="organization"
      :placeholder="$t('clients.create.fields.name.placeholder')"
      :disabled="loading"
      :error="fieldErrors.name"
      required
    />

    <FormField
      v-model="email"
      :label="$t('clients.create.fields.email.label')"
      name="email"
      type="email"
      autocomplete="email"
      :placeholder="$t('clients.create.fields.email.placeholder')"
      :disabled="loading"
      :error="fieldErrors.email"
      required
    />

    <FormResult :error="formError" :success="formSuccess" />

    <FormActions
      :cancel-label="$t('clients.create.actions.cancel')"
      :submit-label="$t('clients.create.actions.submit')"
      :submitting-label="$t('clients.create.actions.submitting')"
      :loading="loading"
      :disabled="loading"
      @cancel="goBack"
    />

    <p class="create-client-form__hint">{{ $t('clients.create.hint') }}</p>
  </form>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import FormActions from '@/components/ui/form/FormActions.vue'
import FormField from '@/components/ui/form/FormField.vue'
import FormResult from '@/components/ui/form/FormResult.vue'
import { getClientDetailsRoute, getClientsRoute } from '@/router/clients'
import { createCompany } from '@/services/companiesService'
import type { CreateCompanyFieldErrors } from '@/types/company'
import {
  buildCreateCompanyPayload,
  createCompanyFieldErrors,
  getCreateCompanyApiFieldError,
  getCreateCompanyApiFormError,
  hasCreateCompanyFormErrors,
  validateCreateCompanyForm,
} from '@/utils/company/create'

const { t } = useI18n()
const router = useRouter()

const name = ref('')
const email = ref('')
const loading = ref(false)
const formError = ref<string | null>(null)
const formSuccess = ref<string | null>(null)
const fieldErrors = reactive<CreateCompanyFieldErrors>(createCompanyFieldErrors())

function resetMessages(): void {
  formError.value = null
  formSuccess.value = null
  Object.assign(fieldErrors, createCompanyFieldErrors())
}

function validateForm(): boolean {
  const errors = validateCreateCompanyForm(
    {
      name: name.value,
      email: email.value,
    },
    t,
  )

  Object.assign(fieldErrors, errors)

  return !hasCreateCompanyFormErrors(errors)
}

async function onSubmit(): Promise<void> {
  if (loading.value) return

  resetMessages()

  if (!validateForm()) {
    return
  }

  loading.value = true

  try {
    const result = await createCompany(
      buildCreateCompanyPayload({
        name: name.value,
        email: email.value,
      }),
    )

    if (!result.ok) {
      const apiFieldError = getCreateCompanyApiFieldError(result.error, t)

      if (apiFieldError) {
        fieldErrors[apiFieldError.field] = apiFieldError.message
        return
      }

      formError.value = getCreateCompanyApiFormError(result.error, t)
      return
    }

    await router.push(getClientDetailsRoute(result.data.company.id))
  } finally {
    loading.value = false
  }
}

function goBack(): void {
  router.push(getClientsRoute())
}
</script>

<style scoped>
.create-client-form {
  display: grid;
  gap: 14px;
}

.create-client-form__hint {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-3);
}
</style>
