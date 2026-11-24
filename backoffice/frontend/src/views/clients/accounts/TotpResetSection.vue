<template>
  <section class="reset" aria-labelledby="totp-reset-title">
    <h2 id="totp-reset-title" class="reset__title">{{ $t('login.mfa.reset.title') }}</h2>
    <p class="reset__text">{{ $t('login.mfa.reset.hint') }}</p>

    <UiButton v-if="!open" type="button" class="reset__button" @click="openForm">
      {{ $t('login.mfa.reset.open') }}
    </UiButton>

    <form v-else class="reset__form" @submit.prevent="onSubmit">
      <div ref="codeBox" aria-live="polite" aria-atomic="false">
        <FormField
          v-model="code"
          :label="$t('login.mfa.code.label')"
          name="code"
          autocomplete="one-time-code"
          autocapitalize="none"
          spellcheck="false"
          :disabled="loading"
          :error="fieldError ? $t(fieldError.key, fieldError.params) : undefined"
          required
        />
      </div>

      <p v-if="formError" class="form-error" role="alert">
        {{ $t(formError.key, formError.params) }}
      </p>

      <UiButton class="reset__button" variant="danger" type="submit" :disabled="loading">
        {{ $t(loading ? 'login.mfa.reset.submitting' : 'login.mfa.reset.submit') }}
      </UiButton>
      <UiButton class="reset__button" type="button" :disabled="loading" @click="open = false">
        {{ $t('login.mfa.reset.cancel') }}
      </UiButton>
    </form>
  </section>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'

import FormField from '@/components/ui/form/FormField.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { logout } from '@/state/authState'
import { resetTotpApi } from '@/utils/auth'
import { mfaFailureMessage, type MfaMessage } from '@/utils/mfaMessage'
import { isBlank } from '@/utils/validation'

const router = useRouter()

const open = ref(false)
const code = ref('')
const loading = ref(false)
const fieldError = ref<MfaMessage | null>(null)
const formError = ref<MfaMessage | null>(null)
const codeBox = ref<HTMLElement | null>(null)

function focusCode() {
  codeBox.value?.querySelector('input')?.focus()
}

async function openForm() {
  open.value = true
  await nextTick()
  focusCode()
}

async function onSubmit() {
  fieldError.value = null
  formError.value = null

  if (isBlank(code.value)) {
    fieldError.value = { key: 'login.mfa.codeRequired', params: {} }
    return
  }

  loading.value = true
  const result = await resetTotpApi({ code: code.value.trim() })

  if (result.ok || result.reason === 'session_ended') {
    // Succès : le serveur a révoqué toutes les sessions, la prochaine connexion repasse par
    // l'enrôlement. Session déjà finie : même sortie, sans afficher un faux « code incorrect ».
    await logout()
    router.replace({ name: 'login' })
    return
  }

  loading.value = false
  code.value = ''
  const message = mfaFailureMessage(result)
  if (result.reason === 'totp_invalid' || result.reason === 'invalid_form') {
    fieldError.value = message
  } else {
    formError.value = message
  }
  focusCode()
}
</script>

<style scoped>
.reset {
  display: grid;
  gap: 14px;
  margin-top: 28px;
  max-width: 480px;
}

.reset__title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-0);
}

.reset__text {
  margin: 0;
  font-size: 13px;
  color: var(--text-1);
}

.reset__form {
  display: grid;
  gap: 14px;
}

.reset__form :deep(.ff__control) {
  min-height: 48px;
}

.reset__button {
  min-height: 48px;
  border-radius: 14px;
}

.reset :deep(.ui-btn:focus-visible) {
  outline: 2px solid var(--border-hover);
  outline-offset: 2px;
}
</style>
