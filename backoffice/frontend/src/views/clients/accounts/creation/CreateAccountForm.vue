<template>
  <form class="account-form" @submit.prevent="onSubmit">
    <div class="account-form__grid">
      <FormField
        v-model="form.firstname"
        :label="$t('accounts.form.fields.firstname.label')"
        name="firstname"
        autocomplete="given-name"
        :placeholder="$t('accounts.form.fields.firstname.placeholder')"
        :disabled="isLoading"
        :error="fieldErrors.firstname"
      />

      <FormField
        v-model="form.lastname"
        :label="$t('accounts.form.fields.lastname.label')"
        name="lastname"
        autocomplete="family-name"
        :placeholder="$t('accounts.form.fields.lastname.placeholder')"
        :disabled="isLoading"
        :error="fieldErrors.lastname"
      />

      <FormField
        v-model="form.username"
        :label="$t('accounts.form.fields.username.label')"
        name="username"
        autocomplete="username"
        :placeholder="$t('accounts.form.fields.username.placeholder')"
        :disabled="isLoading"
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
        :disabled="isLoading"
        :error="fieldErrors.email"
        required
      />

      <div v-if="canManageRole" class="account-form__field">
        <label class="account-form__label" for="role">
          {{ $t('accounts.form.fields.role.label') }}
        </label>

        <select
          id="role"
          v-model="form.role"
          class="account-form__select"
          name="role"
          :disabled="isLoading"
          required
        >
          <option
            v-for="option in roleOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>

        <p v-if="fieldErrors.role" class="account-form__error">
          {{ fieldErrors.role }}
        </p>
      </div>

      <FormField
        v-model="form.password"
        :label="passwordLabel"
        name="password"
        type="password"
        autocomplete="new-password"
        :placeholder="passwordPlaceholder"
        :disabled="isLoading"
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
      :disabled="isLoading"
      @cancel="goBack"
    />

    <p class="account-form__hint">
      {{ hint }}
    </p>
  </form>
</template>

<script setup lang="ts">
import {
  ADMIN_ROLE_ADMIN,
  ADMIN_ROLE_SUPERADMIN,
  ADMIN_ROLE_USER,
  type AdminRole,
} from '@quizzup/shared'
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
import { me, refreshMe } from '@/state/authState'
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

type RoleOption = {
  value: AdminRole
  label: string
}

const props = withDefaults(
  defineProps<{
    mode: 'create' | 'edit'
    companyId: number
    account?: Account | null
    loadingAccount?: boolean
    profileMode?: boolean
  }>(),
  {
    account: null,
    loadingAccount: false,
    profileMode: false,
  },
)

const { t } = useI18n()
const router = useRouter()

const loading = ref(false)
const formError = ref<string | null>(null)
const formSuccess = ref<string | null>(null)

const form = reactive<AccountFormValues>(createDefaultAccountFormValues())
const fieldErrors = reactive<AccountFieldErrors>(createAccountFieldErrors())

const isEditMode = computed(() => props.mode === 'edit')
const isLoading = computed(() => loading.value || props.loadingAccount === true)

const currentRole = computed(() => me.value?.role)

const roleOptions = computed<RoleOption[]>(() => {
  if (currentRole.value === ADMIN_ROLE_SUPERADMIN) {
    return [
      {
        value: ADMIN_ROLE_SUPERADMIN,
        label: t('accounts.form.fields.role.options.superadmin'),
      },
      {
        value: ADMIN_ROLE_ADMIN,
        label: t('accounts.form.fields.role.options.admin'),
      },
      {
        value: ADMIN_ROLE_USER,
        label: t('accounts.form.fields.role.options.user'),
      },
    ]
  }

  if (currentRole.value === ADMIN_ROLE_ADMIN) {
    return [
      {
        value: ADMIN_ROLE_ADMIN,
        label: t('accounts.form.fields.role.options.admin'),
      },
      {
        value: ADMIN_ROLE_USER,
        label: t('accounts.form.fields.role.options.user'),
      },
    ]
  }

  return []
})

const canManageRole = computed(() => !props.profileMode && roleOptions.value.length > 0)

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

watch(
  () => props.mode,
  () => {
    if (props.mode === 'create') {
      form.role = ADMIN_ROLE_USER
    }
  },
  { immediate: true },
)

watch(
  roleOptions,
  (options) => {
    if (!canManageRole.value) {
      return
    }

    const hasCurrentRoleOption = options.some((option) => option.value === form.role)

    if (!hasCurrentRoleOption) {
      form.role = ADMIN_ROLE_USER
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
  const errors = validateAccountForm(form, t, props.mode, canManageRole.value)

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
        ? await createCompanyAccountService(
            props.companyId,
            buildCreateAccountPayload(form, canManageRole.value),
          )
        : props.account
          ? await updateCompanyAccountService(
              props.companyId,
              props.account.id,
              buildUpdateAccountPayload(form, canManageRole.value),
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

    if (props.profileMode) {
      await refreshMe()
      formSuccess.value = t('accounts.form.success.profileUpdated')
      return
    }

    await router.push(getCompanyAccountsRoute(props.companyId))
  } finally {
    loading.value = false
  }
}

function goBack(): void {
  if (props.profileMode) {
    router.push({ name: 'home' })
    return
  }

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

.account-form__field {
  display: grid;
  gap: 6px;
}

.account-form__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
}

.account-form__select {
  width: 100%;
  min-height: 42px;
  border: 1px solid var(--border-ui);
  border-radius: 12px;
  padding: 0 12px;
  background: var(--surface-1);
  color: var(--text-1);
  outline: none;
}

.account-form__select:focus {
  border-color: var(--primary);
}

.account-form__select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.account-form__error {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
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
