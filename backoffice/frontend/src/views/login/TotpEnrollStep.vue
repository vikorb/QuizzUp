<template>
  <div class="form">
    <h2 class="step-title">{{ $t('login.mfa.enroll.title') }}</h2>

    <p v-if="starting" class="step-text" role="status">{{ $t('login.mfa.enroll.loading') }}</p>

    <template v-else-if="secret">
      <p class="step-text">{{ $t('login.mfa.enroll.intro') }}</p>

      <img v-if="qrSrc" class="qr" :src="qrSrc" :alt="$t('login.mfa.enroll.qrAlt')" />

      <details class="manual" :open="!qrSrc">
        <summary class="manual-summary">{{ $t('login.mfa.enroll.manual') }}</summary>
        <dl class="secret-block">
          <dt class="step-text">{{ $t('login.mfa.enroll.secretLabel') }}</dt>
          <dd class="secret-value">
            <code class="secret">{{ groupedSecret }}</code>
          </dd>
        </dl>
      </details>

      <a v-if="otpauthHref" class="link" :href="otpauthHref">
        {{ $t('login.mfa.enroll.openLink') }}
      </a>

      <form class="form" @submit.prevent="onConfirm">
        <div ref="codeBox" aria-live="polite" aria-atomic="false">
          <FormField
            v-model="code"
            :label="$t('login.mfa.code.label')"
            name="code"
            autocomplete="one-time-code"
            inputmode="numeric"
            :disabled="confirming"
            :error="fieldError ? $t(fieldError.key, fieldError.params) : undefined"
            required
          />
        </div>

        <p v-if="formError" class="form-error" role="alert">
          {{ $t(formError.key, formError.params) }}
        </p>

        <UiButton class="submit" variant="primary" type="submit" :disabled="confirming">
          {{ $t(confirming ? 'login.mfa.enroll.submitting' : 'login.mfa.enroll.submit') }}
        </UiButton>
      </form>
    </template>

    <p v-if="startError" class="form-error" role="alert">
      {{ $t(startError.key, startError.params) }}
    </p>

    <UiButton v-if="canRestart" class="secondary" type="button" @click="start">
      {{ $t('login.mfa.enroll.restart') }}
    </UiButton>
    <UiButton class="secondary" type="button" :disabled="confirming" @click="emit('back', null)">
      {{ $t('login.mfa.back') }}
    </UiButton>
  </div>
</template>

<script setup lang="ts">
import { TOTP_CODE_LENGTH } from '@quizzup/shared'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import FormField from '@/components/ui/form/FormField.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { confirmTotpEnrollApi, startTotpEnrollApi } from '@/utils/auth'
import { INVALID_CODE_MESSAGE, mfaFailureMessage, type MfaMessage } from '@/utils/mfaMessage'
import { getQrSvgSrc } from '@/utils/qr'

const props = defineProps<{ challengeToken: string }>()

const emit = defineEmits<{
  (event: 'enrolled', session: { token: string; recoveryCodes: string[] }): void
  /** Retour à l'identifiant : avec un message si le serveur l'impose (défi expiré), sinon `null`. */
  (event: 'back', message: MfaMessage | null): void
}>()

// Le secret reste ici, en mémoire : ni URL, ni stockage, ni journal. Le QR code, qui le contient, suit la même règle.
const secret = ref('')
const otpauthUrl = ref('')
const qrSvg = ref('')
const code = ref('')
const starting = ref(false)
const confirming = ref(false)
const startError = ref<MfaMessage | null>(null)
const fieldError = ref<MfaMessage | null>(null)
const formError = ref<MfaMessage | null>(null)
const canRestart = ref(false)
const codeBox = ref<HTMLElement | null>(null)

// « JBSWY3DPEHPK3PXP » devient « JBSW Y3DP EHPK 3PXP » : plus lisible, et l'application accepte les espaces.
const groupedSecret = computed(() => secret.value.replace(/(.{4})(?=.)/g, '$1 '))
// Le lien vient du serveur : seul le schéma `otpauth:` est suivi.
const otpauthHref = computed(() =>
  otpauthUrl.value.startsWith('otpauth://') ? otpauthUrl.value : undefined
)
// Image, jamais `v-html` : un SVG dans un `<img>` n'exécute aucun script.
const qrSrc = computed(() => getQrSvgSrc(qrSvg.value))

function focusCode() {
  codeBox.value?.querySelector('input')?.focus()
}

watch(secret, async (value) => {
  if (!value) return
  await nextTick()
  focusCode()
})

function clearSecret() {
  secret.value = ''
  otpauthUrl.value = ''
  qrSvg.value = ''
}

async function start() {
  starting.value = true
  canRestart.value = false
  startError.value = null
  fieldError.value = null
  formError.value = null
  code.value = ''
  clearSecret()

  const result = await startTotpEnrollApi({ challengeToken: props.challengeToken })
  starting.value = false

  if (result.ok) {
    secret.value = result.secret
    otpauthUrl.value = result.otpauthUrl
    qrSvg.value = result.qrSvg
  } else if (
    result.reason === 'mfa_challenge_invalid' ||
    result.reason === 'totp_already_enrolled'
  ) {
    emit('back', mfaFailureMessage(result))
  } else {
    startError.value = mfaFailureMessage(result)
    canRestart.value = true
  }
}

onMounted(start)
onBeforeUnmount(clearSecret)

async function onConfirm() {
  fieldError.value = null
  formError.value = null

  const digits = code.value.replace(/\s/g, '')
  if (!new RegExp(`^\\d{${TOTP_CODE_LENGTH}}$`).test(digits)) {
    fieldError.value = INVALID_CODE_MESSAGE
    return
  }

  confirming.value = true
  const result = await confirmTotpEnrollApi({ challengeToken: props.challengeToken, code: digits })

  if (result.ok) {
    // `confirming` reste vrai : la vue parente passe aux codes de secours.
    emit('enrolled', { token: result.token, recoveryCodes: result.recoveryCodes })
    return
  }

  confirming.value = false

  if (result.reason === 'mfa_challenge_invalid' || result.reason === 'totp_already_enrolled') {
    emit('back', mfaFailureMessage(result))
    return
  }

  code.value = ''
  const message =
    result.reason === 'invalid_form' ? INVALID_CODE_MESSAGE : mfaFailureMessage(result)
  if (result.reason === 'totp_invalid' || result.reason === 'invalid_form') {
    fieldError.value = message
  } else {
    formError.value = message
    // Secret remplacé ailleurs, ou enrôlement perdu : le secret affiché ne sert plus.
    canRestart.value =
      result.reason === 'totp_enrollment_changed' || result.reason === 'totp_not_enrolled'
  }
  focusCode()
}
</script>

<style scoped src="./mfaStep.css"></style>

<style scoped>
.qr {
  width: 200px;
  height: 200px;
  max-width: 100%;
  background: var(--print-paper);
  border-radius: var(--radius-sm);
}

.manual-summary {
  /* `list-item` garde le triangle natif de dépliage, qu'un `flex` ferait disparaître. */
  display: list-item;
  align-content: center;
  min-height: 48px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-1);
  cursor: pointer;
}

.manual-summary:focus-visible {
  outline: 2px solid var(--border-hover);
  outline-offset: 2px;
}

.secret-block {
  display: grid;
  gap: 8px;
  margin: 0;
}

.secret-value {
  margin: 0;
}

.secret {
  padding: 12px 14px;
  border: 1px solid var(--border-ui);
  border-radius: var(--radius);
  background: var(--surface-inset);
  color: var(--text-0);
  display: block;
  font-family: inherit;
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 1px;
  overflow-wrap: anywhere;
  user-select: all;
}
</style>
