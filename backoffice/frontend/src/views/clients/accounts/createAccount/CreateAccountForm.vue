<template>
  <form class="account-form" @submit.prevent="onSubmit">
    <div class="account-form__grid">
      <FormField
        v-model="form.firstname"
        :label="$t('accounts.form.fields.firstname.label')"
        name="firstname"
        autocomplete="given-name"
        :placeholder="$t('accounts.form.fields.firstname.placeholder')"
        :disabled="loading"
        :error="fieldErrors.firstname"
      />

      <FormField
        v-model="form.lastname"
        :label="$t('accounts.form.fields.lastname.label')"
        name="lastname"
        autocomplete="family-name"
        :placeholder="$t('accounts.form.fields.lastname.placeholder')"
        :disabled="loading"
        :error="fieldErrors.lastname"
      />

      <FormField
        v-model="form.username"
        :label="$t('accounts.form.fields.username.label')"
        name="username"
        autocomplete="username"
        :placeholder="$t('accounts.form.fields.username.placeholder')"
        :disabled="loading"
        :error="fieldErrors.username"
        required
      />

      <FormField
        v-model="form.email"
        :label="$t('accounts.form.fields.email.label')"
        name="email"
        type="email"
        autocomplete="email"
        :placeholder="$t('accounts.form.fields.email.placeholder')"
        :disabled="loading"
        :error="fieldErrors.email"
        required
      />

      <FormField
        v-model="form.role"
        :label="$t('accounts.form.fields.role.label')"
        name="role"
        autocomplete="off"
        :placeholder="$t('accounts.form.fields.role.placeholder')"
        :disabled="loading"
        :error="fieldErrors.role"
        required
      />

      <FormField
        v-model="form.password"
        :label="passwordLabel"
        name="password"
        type="password"
        autocomplete="new-password"
        :placeholder="passwordPlaceholder"
        :disabled="loading"
        :error="fieldErrors.password"
        :required="mode === 'create'"
      />
    </div>

    <FormResult :error="formError" :success="formSuccess" />

    <FormActions
      :cancel-label="$t('accounts.form.actions.cancel')"
      :submit-label="submitLabel"
      :submitting-label="$t('accounts.form.actions.submitting')"
      :loading="loading"
      :disabled="loading"
      @cancel="goBack"
    />

    <p class="account-form__hint">
      {{ hint }}
    </p>
  </form>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import FormActions from '@/components/ui/form/FormActions.vue'
import FormField from '@/components/ui/form/FormField.vue'
import FormResult from '@/components/ui/form/FormResult.vue'
import { getCompanyAccountsRoute } from '@/router/clients'
import {
  createCompanyAccountService,
  updateCompanyAccountService,
} from '@/services/accountsService'
import type { Account, AccountFieldErrors, AccountFormValues } from '@/types/account'
import {
  buildCreateAccountPayload,
  buildUpdateAccountPayload,
  createAccountFieldErrors,
  createDefaultAccountFormValues,
  getAccountApiFieldError,
  getAccountApiFormError,
  getAccountFormValues,
  hasAccountFormErrors,
  validateAccountForm,
} from '@/utils/account/form'

const props = defineProps<{
  mode: 'create' | 'edit'
  companyId: number
  account?: Account | null
  loadingAccount?: boolean
}>()

const { t } = useI18n()
const router = useRouter()

const loading = ref(false)
const formError = ref<string | null>(null)
const formSuccess = ref<string | null>(null)

const form = reactive<AccountFormValues>(createDefaultAccountFormValues())
const fieldErrors = reactive<AccountFieldErrors>(createAccountFieldErrors())

const isEditMode = computed(() => props.mode === 'edit')
const isLoading = computed(() => loading.value || props.loadingAccount === true)
const submitLabel = computed(() =>
  isEditMode.value ? t('accounts.form.actions.update') : t('accounts.form.actions.create'),
)

const passwordLabel = computed(() =>
  isEditMode.value
    ? t('accounts.form.fields.password.editLabel')
    : t('accounts.form.fields.password.label'),
)

const passwordPlaceholder = computed(() =>
  isEditMode.value
    ? t('accounts.form.fields.password.editPlaceholder')
    : t('accounts.form.fields.password.placeholder'),
)

const hint = computed(() =>
  isEditMode.value ? t('accounts.form.hints.edit') : t('accounts.form.hints.create'),
)

watch(
  () => props.account,
  (account) => {
    if (account && props.mode === 'edit') {
      Object.assign(form, getAccountFormValues(account))
    }
  },
  { immediate: true },
)

function resetMessages(): void {
  formError.value = null
  formSuccess.value = null
  Object.assign(fieldErrors, createAccountFieldErrors())
}

function validateForm(): boolean {
  const errors = validateAccountForm(form, t, props.mode)

  Object.assign(fieldErrors, errors)

  return !hasAccountFormErrors(errors)
}

async function onSubmit(): Promise<void> {
  if (isLoading.value) {
    return
  }

  resetMessages()

  if (!validateForm()) {
    return
  }

  loading.value = true

  try {
    const result =
      props.mode === 'create'
        ? await createCompanyAccountService(props.companyId, buildCreateAccountPayload(form))
        : props.account
          ? await updateCompanyAccountService(
              props.companyId,
              props.account.id,
              buildUpdateAccountPayload(form),
            )
          : null

    if (!result) {
      formError.value = t('accounts.form.errors.not_found')
      return
    }

    if (!result.ok) {
      const apiFieldError = getAccountApiFieldError(result.error, t)

      if (apiFieldError) {
        fieldErrors[apiFieldError.field] = apiFieldError.message
        return
      }

      formError.value = getAccountApiFormError(result.error, t)
      return
    }

    await router.push(getCompanyAccountsRoute(props.companyId))
  } finally {
    loading.value = false
  }
}

function goBack(): void {
  router.push(getCompanyAccountsRoute(props.companyId))
}
</script>

<style scoped>
.account-form {
  display: grid;
  gap: 14px;
}

.account-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.account-form__hint {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-3);
}

@media (max-width: 760px) {
  .account-form__grid {
    grid-template-columns: 1fr;
  }
}
</style>
