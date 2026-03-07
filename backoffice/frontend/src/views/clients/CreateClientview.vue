<template>
  <SectionLayout
    :title="$t('clients.create.title')"
    :subtitle="$t('clients.create.subtitle')"
  >
    <BaseCard
      :title="$t('clients.create.cardTitle')"
      :neon="true"
      :no-hover="true"
      class="create-client-card"
    >
      <form class="form" @submit.prevent="onSubmit">
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
          @enter="onSubmit"
        />

        <p v-if="formError" class="form-error">{{ formError }}</p>
        <p v-if="formSuccess" class="form-success">{{ formSuccess }}</p>

        <div class="actions">
          <UiButton
            variant="default"
            type="button"
            :disabled="loading"
            @click="goBack"
          >
            {{ $t('clients.create.actions.cancel') }}
          </UiButton>

          <UiButton
            variant="primary"
            type="submit"
            :disabled="loading"
          >
            <span v-if="!loading">{{ $t('clients.create.actions.submit') }}</span>
            <span v-else>{{ $t('clients.create.actions.submitting') }}</span>
          </UiButton>
        </div>

        <p class="hint">{{ $t('clients.create.hint') }}</p>
      </form>
    </BaseCard>
  </SectionLayout>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import SectionLayout from '@/components/SectionLayout.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import FormField from '@/components/ui/form/FormField.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { getClientsRoute } from '@/router/clients'
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
      if (result.status === 409) {
        formError.value = t('clients.create.errors.emailAlreadyExists')
        return
      }

      formError.value = t(getApiErrorKey(result.error, 'clients.create.errorsApi'))
      return
    }

    formSuccess.value = t('clients.create.success')

    name.value = ''
    email.value = ''
  } finally {
    loading.value = false
  }
}

function goBack(): void {
  router.push(getClientsRoute())
}
</script>

<style scoped>
.create-client-card {
  margin-top: 10px;
}

.form {
  display: grid;
  gap: 14px;
}

.form-error {
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(237, 46, 251, 0.35);
  background: rgba(237, 46, 251, 0.08);
  color: rgba(255, 255, 255, 0.92);
  font-size: 13px;
}

.form-success {
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(0, 242, 255, 0.28);
  background: rgba(0, 242, 255, 0.08);
  color: rgba(255, 255, 255, 0.92);
  font-size: 13px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.hint {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-3);
}

@media (max-width: 980px) {
  .actions {
    flex-direction: column-reverse;
  }

  .actions :deep(.ui-btn) {
    width: 100%;
  }
}
</style>
