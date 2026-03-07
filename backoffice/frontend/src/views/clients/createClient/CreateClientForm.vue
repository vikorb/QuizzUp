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
import { apiRequestJson, getApiErrorKey } from '@/utils/api'
import { isBlank } from '@/utils/validation'

type CreateCompanyResponse = {
  company: {
    id: number
    name: string
    email: string
    accountsCount: number
  }
}

const { t } = useI18n()
const router = useRouter()
const name = ref('')
const email = ref('')
const loading = ref(false)
const formError = ref<string | null>(null)
const formSuccess = ref<string | null>(null)
const fieldErrors = reactive<{ name?: string; email?: string }>({})

function resetMessages(): void {
  formError.value = null
  formSuccess.value = null
  fieldErrors.name = undefined
  fieldErrors.email = undefined
}

function validateForm(): boolean {
  if (isBlank(name.value)) {
    fieldErrors.name = t('clients.create.errors.required')
  }

  if (isBlank(email.value)) {
    fieldErrors.email = t('clients.create.errors.required')
  } else if (!email.value.includes('@')) {
    fieldErrors.email = t('clients.create.errors.invalidEmail')
  }

  return !fieldErrors.name && !fieldErrors.email
}

async function onSubmit(): Promise<void> {
  if (loading.value) return

  resetMessages()

  if (!validateForm()) {
    return
  }

  loading.value = true

  try {
    const result = await apiRequestJson<CreateCompanyResponse>({
      path: '/companies',
      method: 'POST',
      authenticated: true,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: name.value.trim(),
        email: email.value.trim().toLowerCase(),
      }),
    })

    if (!result.ok) {
      if (result.error === 'invalid_email') {
        fieldErrors.email = t('clients.create.errors.invalidEmail')
        return
      }

      if (result.error === 'email_already_exists') {
        fieldErrors.email = t('clients.create.errorsApi.emailAlreadyExists')
        return
      }

      if (result.error === 'name_already_exists') {
        fieldErrors.name = t('clients.create.errorsApi.nameAlreadyExists')
        return
      }

      formError.value = t(getApiErrorKey(result.error, 'clients.create.errorsApi'))
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
