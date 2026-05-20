<template>
  <form class="company-form" @submit.prevent="$emit('submit')">
    <div class="company-form__grid">
      <FormField
        v-model="nameModel"
        :label="$t('clients.details.form.fields.name.label')"
        name="name"
        autocomplete="organization"
        :placeholder="$t('clients.details.form.fields.name.placeholder')"
        :disabled="companySaving || isCompanyReadonly"
        :error="fieldErrors.name"
        required
      />

      <FormField
        v-model="emailModel"
        :label="$t('clients.details.form.fields.email.label')"
        name="email"
        type="email"
        autocomplete="email"
        :placeholder="$t('clients.details.form.fields.email.placeholder')"
        :disabled="companySaving || isCompanyReadonly"
        :error="fieldErrors.email"
        required
      />
    </div>

    <ClientDetailSwitch
      v-if="canShowStatusSwitch"
      :status="status"
      :original-status="originalStatus"
      :disabled="companySaving"
      @toggle="$emit('toggle-status')"
    />

    <FormResult v-if="canManageCompany" :error="formError" :success="formSuccess" />

    <div v-if="canManageCompany" class="company-form__actions">
      <UiButton variant="default" type="button" :disabled="companySaving" @click="$emit('reset')">
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
import type { CompanyStatus } from '@quizzup/shared'
import { computed } from 'vue'

import FormField from '@/components/ui/form/FormField.vue'
import FormResult from '@/components/ui/form/FormResult.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { EditCompanyFieldErrors } from '@/types/company'

import ClientDetailSwitch from './ClientDetailSwitch.vue'

const props = defineProps<{
  name: string
  email: string
  status: CompanyStatus
  originalStatus: CompanyStatus
  fieldErrors: EditCompanyFieldErrors
  companySaving: boolean
  isCompanyReadonly: boolean
  canManageCompany: boolean
  canShowStatusSwitch: boolean
  hasCompanyChanges: boolean
  formError: string | null
  formSuccess: string | null
}>()

const emit = defineEmits<{
  (event: 'update:name', value: string): void
  (event: 'update:email', value: string): void
  (event: 'toggle-status'): void
  (event: 'reset'): void
  (event: 'submit'): void
}>()

const nameModel = computed({
  get: () => props.name,
  set: (value: string) => emit('update:name', value),
})

const emailModel = computed({
  get: () => props.email,
  set: (value: string) => emit('update:email', value),
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
