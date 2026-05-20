<template>
  <form class="company-form" @submit.prevent="handleSubmit">
    <div class="company-form__grid">
      <FormField
        v-model="form.name"
        :label="$t('clients.details.form.fields.name.label')"
        name="name"
        autocomplete="organization"
        :placeholder="$t('clients.details.form.fields.name.placeholder')"
        :disabled="companySaving || permissions.isCompanyReadonly"
        :error="fieldErrors.name"
        required
      />

      <FormField
        v-model="form.email"
        :label="$t('clients.details.form.fields.email.label')"
        name="email"
        type="email"
        autocomplete="email"
        :placeholder="$t('clients.details.form.fields.email.placeholder')"
        :disabled="companySaving || permissions.isCompanyReadonly"
        :error="fieldErrors.email"
        required
      />
    </div>

    <ClientDetailSwitch
      v-if="permissions.canShowStatusSwitch"
      :status="form.status"
      :original-status="company.status"
      :disabled="companySaving"
      @toggle="toggleCompanyStatus"
    />

    <FormResult
      v-if="permissions.canManageCompany"
      :error="formError"
      :success="formSuccess"
    />

    <div v-if="permissions.canManageCompany" class="company-form__actions">
      <UiButton variant="default" type="button" :disabled="companySaving" @click="resetCompanyForm">
        {{ $t('clients.details.actions.reset') }}
      </UiButton>

      <UiButton variant="primary" type="submit" :disabled="companySaving || !hasCompanyChanges">
        {{
          companySaving
            ? $t('clients.details.actions.saving')
            : $t('clients.details.actions.save')
        }}
      </UiButton>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import FormField from '@/components/ui/form/FormField.vue'
import FormResult from '@/components/ui/form/FormResult.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { me } from '@/state/authState'
import type { Company } from '@/types/company'
import type { TimerHandle } from '@/types/timer'
import {
  createClientDetailFieldErrors,
  createClientDetailFormValues,
  getClientDetailFormValues,
  getClientDetailNextStatus,
  getClientDetailPermissions,
  hasClientDetailCompanyChanges,
  saveClientDetailCompany,
} from '@/utils/company/details/form'
import { clearTimer, scheduleTimer } from '@/utils/timer'

import ClientDetailSwitch from './ClientDetailSwitch.vue'

const props = defineProps<{
  company: Company
}>()

const emit = defineEmits<{
  (event: 'updated', company: Company): void
}>()

const { t } = useI18n()
const companySaving = ref(false)
const formError = ref<string | null>(null)
const formSuccess = ref<string | null>(null)
const formSuccessTimer = ref<TimerHandle | null>(null)
const ignoreNextCompanySync = ref(false)
const form = reactive(createClientDetailFormValues())
const fieldErrors = reactive(createClientDetailFieldErrors())
Object.assign(form, getClientDetailFormValues(props.company))
const permissions = computed(() => getClientDetailPermissions(me.value?.role ?? null))

const hasCompanyChanges = computed(() =>
  hasClientDetailCompanyChanges(form, props.company, permissions.value.canManageCompany),
)

function clearSuccessMessageTimer(): void {
  formSuccessTimer.value = clearTimer(formSuccessTimer.value)
}

function resetFieldErrors(): void {
  Object.assign(fieldErrors, createClientDetailFieldErrors())
}

function resetFormMessages(): void {
  clearSuccessMessageTimer()
  formError.value = null
  formSuccess.value = null
  resetFieldErrors()
}

function dismissFormSuccessLater(): void {
  formSuccessTimer.value = scheduleTimer(formSuccessTimer.value, () => {
    formSuccess.value = null
    formSuccessTimer.value = null
  })
}

function resetCompanyForm(): void {
  if (!permissions.value.canManageCompany) {
    return
  }

  resetFormMessages()
  Object.assign(form, getClientDetailFormValues(props.company))
}

function toggleCompanyStatus(): void {
  if (!permissions.value.canShowStatusSwitch) {
    return
  }

  clearSuccessMessageTimer()
  formSuccess.value = null
  form.status = getClientDetailNextStatus(form.status)
}

async function handleSubmit(): Promise<void> {
  if (
    !permissions.value.canManageCompany ||
    companySaving.value ||
    !hasCompanyChanges.value
  ) {
    return
  }

  resetFormMessages()
  companySaving.value = true

  try {
    const result = await saveClientDetailCompany(props.company.id, form, t)

    if (!result.ok) {
      Object.assign(fieldErrors, result.fieldErrors)
      formError.value = result.formError
      return
    }

    Object.assign(form, getClientDetailFormValues(result.company))

    formSuccess.value = result.successMessage
    ignoreNextCompanySync.value = true

    emit('updated', result.company)
    dismissFormSuccessLater()
  } finally {
    companySaving.value = false
  }
}

watch(
  () => props.company,
  (company) => {
    if (ignoreNextCompanySync.value) {
      ignoreNextCompanySync.value = false
      return
    }

    resetFormMessages()
    Object.assign(form, getClientDetailFormValues(company))
  },
)

onBeforeUnmount(() => {
  clearSuccessMessageTimer()
})
</script>

<style scoped>
.company-form {
  display: grid;
  gap: 16px;
}

.company-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.company-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 760px) {
  .company-form__grid {
    grid-template-columns: 1fr;
  }

  .company-form__actions {
    flex-direction: column-reverse;
  }
}
</style>
