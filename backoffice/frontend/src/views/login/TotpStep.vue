<template>
  <form class="form" @submit.prevent="onSubmit">
    <h2 class="step-title">{{ $t('login.mfa.totp.title') }}</h2>
    <p class="step-text">{{ $t('login.mfa.totp.hint', { length: TOTP_CODE_LENGTH }) }}</p>

    <div ref="codeBox" aria-live="polite" aria-atomic="false">
      <FormField
        v-model="code"
        :label="$t('login.mfa.code.label')"
        name="code"
        autocomplete="one-time-code"
        inputmode="numeric"
        :disabled="loading"
        :error="fieldError ? $t(fieldError.key, fieldError.params) : undefined"
        required
      />
    </div>

    <p v-if="formError" class="form-error" role="alert">
      {{ $t(formError.key, formError.params) }}
    </p>

    <UiButton class="submit" variant="primary" type="submit" :disabled="loading">
      {{ $t(loading ? 'login.mfa.totp.submitting' : 'login.mfa.totp.submit') }}
    </UiButton>
    <UiButton class="secondary" type="button" :disabled="loading" @click="emit('back', null)">
      {{ $t('login.mfa.back') }}
    </UiButton>
  </form>
</template>

<script setup lang="ts">
import { TOTP_CODE_LENGTH } from '@quizzup/shared'
import { onMounted, ref } from 'vue'

import FormField from '@/components/ui/form/FormField.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { loginTotpApi } from '@/utils/auth'
import { mfaFailureMessage, type MfaMessage } from '@/utils/mfaMessage'
import { isBlank } from '@/utils/validation'

const props = defineProps<{ challengeToken: string }>()

const emit = defineEmits<{
  (event: 'signed-in', token: string): void
  /** Retour à l'identifiant : avec un message si le serveur l'impose (défi expiré), sinon `null`. */
  (event: 'back', message: MfaMessage | null): void
  /** Le serveur n'a pas d'application enrôlée pour ce compte : passer à l'enrôlement. */
  (event: 'enroll'): void
}>()

const code = ref('')
const loading = ref(false)
const fieldError = ref<MfaMessage | null>(null)
const formError = ref<MfaMessage | null>(null)
const codeBox = ref<HTMLElement | null>(null)

function focusCode() {
  codeBox.value?.querySelector('input')?.focus()
}

onMounted(focusCode)

async function onSubmit() {
  fieldError.value = null
  formError.value = null

  if (isBlank(code.value)) {
    fieldError.value = { key: 'login.mfa.codeRequired', params: {} }
    return
  }

  loading.value = true
  const result = await loginTotpApi({
    challengeToken: props.challengeToken,
    code: code.value.trim(),
  })

  if (result.ok) {
    // `loading` reste vrai : la vue parente ouvre la session puis quitte l'écran.
    emit('signed-in', result.token)
    return
  }

  loading.value = false

  if (result.reason === 'mfa_challenge_invalid') {
    emit('back', mfaFailureMessage(result))
  } else if (result.reason === 'totp_not_enrolled') {
    emit('enroll')
  } else {
    code.value = ''
    const message = mfaFailureMessage(result)
    if (result.reason === 'totp_invalid' || result.reason === 'invalid_form') {
      fieldError.value = message
    } else {
      formError.value = message
    }
    focusCode()
  }
}
</script>

<style scoped src="./mfaStep.css"></style>
