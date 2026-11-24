<template>
  <main class="join">
    <header class="join__head">
      <img v-if="link?.logoUrl" class="join__logo" :src="link.logoUrl" alt="" />
      <div>
        <h1 class="join__title">{{ t('pageTitle') }}</h1>
        <p v-if="link" class="join__venue">{{ link.companyName }} · {{ link.roomName }}</p>
      </div>
    </header>

    <p v-if="screen === 'loading'" class="join__text" role="status">{{ t('loading') }}</p>

    <section v-else-if="screen === 'invalid'" class="join__state">
      <h2>{{ t('invalidTitle') }}</h2>
      <p class="join__text">{{ t('invalidText') }}</p>
    </section>

    <section v-else-if="screen === 'closed'" class="join__state">
      <h2>{{ t('closedTitle') }}</h2>
      <p class="join__text">{{ t('closedText') }}</p>
    </section>

    <section v-else-if="screen === 'lookupFailed'" class="join__state">
      <h2>{{ t('lookupFailedTitle') }}</h2>
      <p class="join__text">{{ t('lookupFailedText') }}</p>
      <UiButton class="join__btn" variant="primary" @click="load">{{ t('retry') }}</UiButton>
    </section>

    <section v-else-if="screen === 'sent'" class="join__state" role="status">
      <h2>{{ t('successTitle') }}</h2>
      <p class="join__text">{{ t('successText') }}</p>
      <UiButton class="join__btn" @click="restart">{{ t('another') }}</UiButton>
    </section>

    <form v-else class="join__form" novalidate @submit.prevent="submit">
      <p class="join__text">{{ t('intro') }}</p>

      <fieldset v-for="(player, index) in players" :key="index" class="join__player">
        <legend class="join__legend">{{ t('playerTitle', { n: index + 1 }) }}</legend>

        <div class="join__field">
          <label :for="`name-${index}`">{{ t('displayName') }}</label>
          <input
            :id="`name-${index}`"
            v-model="player.displayName"
            type="text"
            :maxlength="JOIN_DISPLAY_NAME_MAX_LENGTH"
            :autocomplete="index === 0 ? 'given-name' : 'off'"
            required
            :aria-invalid="Boolean(errors[index]?.displayName)"
            :aria-describedby="`name-hint-${index} name-error-${index}`"
          />
          <p :id="`name-hint-${index}`" class="join__hint">{{ t('displayNameHint') }}</p>
          <p
            v-if="errors[index]?.displayName"
            :id="`name-error-${index}`"
            class="join__error"
            role="alert"
          >
            {{ t(errors[index]!.displayName!) }}
          </p>
        </div>

        <div class="join__field">
          <label :for="`email-${index}`">{{ t('email') }}</label>
          <input
            :id="`email-${index}`"
            v-model="player.email"
            type="email"
            inputmode="email"
            :autocomplete="index === 0 ? 'email' : 'off'"
            :aria-invalid="Boolean(errors[index]?.email)"
            :aria-describedby="`email-error-${index}`"
          />
          <p
            v-if="errors[index]?.email"
            :id="`email-error-${index}`"
            class="join__error"
            role="alert"
          >
            {{ t(errors[index]!.email!) }}
          </p>
        </div>

        <template v-if="player.email.trim() !== ''">
          <div class="join__check">
            <input
              :id="`consent-${index}`"
              v-model="player.emailConsent"
              type="checkbox"
              :aria-invalid="Boolean(errors[index]?.emailConsent)"
              :aria-describedby="`consent-error-${index}`"
            />
            <label :for="`consent-${index}`">{{ t('emailConsent') }}</label>
          </div>
          <p
            v-if="errors[index]?.emailConsent"
            :id="`consent-error-${index}`"
            class="join__error"
            role="alert"
          >
            {{ t(errors[index]!.emailConsent!) }}
          </p>

          <div class="join__check">
            <input :id="`marketing-${index}`" v-model="player.marketingConsent" type="checkbox" />
            <label :for="`marketing-${index}`">{{ t('marketingConsent') }}</label>
          </div>

          <div class="join__check">
            <input
              :id="`age-${index}`"
              v-model="player.ageConfirmed"
              type="checkbox"
              :aria-invalid="Boolean(errors[index]?.ageConfirmed)"
              :aria-describedby="`age-error-${index}`"
            />
            <label :for="`age-${index}`">{{ t('ageConfirmed') }}</label>
          </div>
          <p
            v-if="errors[index]?.ageConfirmed"
            :id="`age-error-${index}`"
            class="join__error"
            role="alert"
          >
            {{ t(errors[index]!.ageConfirmed!) }}
          </p>
        </template>
      </fieldset>

      <UiButton
        class="join__btn"
        :aria-expanded="players.length > 1"
        @click="players.length > 1 ? players.pop() : players.push(emptyPlayer())"
      >
        {{ players.length > 1 ? t('removeSecond') : t('addSecond') }}
      </UiButton>

      <details class="join__notice">
        <summary>{{ t('noticeTitle') }}</summary>
        <p class="join__text">{{ t('noticeText', NOTICE_PARAMS) }}</p>
      </details>

      <div aria-live="polite">
        <p v-if="submitError" class="join__error join__error--box">{{ submitError }}</p>
      </div>

      <UiButton class="join__btn" variant="primary" type="submit" :disabled="sending">
        {{ sending ? t('sending') : failed === 'network' ? t('retry') : t('submit') }}
      </UiButton>
    </form>
  </main>
</template>

<script setup lang="ts">
import { JOIN_DISPLAY_NAME_MAX_LENGTH } from '@quizzup/shared'
import { computed, nextTick, onMounted, ref } from 'vue'

import UiButton from '@/components/ui/UiButton.vue'
import { createTranslator, detectLocale } from '@/public/i18n'

import {
  type JoinFailure,
  type JoinLookup,
  type JoinPlayerInput,
  lookupJoinLink,
  sendJoinRegistration,
} from './joinApi'
import { joinMessages, NOTICE_PARAMS } from './messages'

type MessageKey = Parameters<ReturnType<typeof createTranslator<typeof joinMessages.fr>>>[0]

type PlayerDraft = {
  displayName: string
  email: string
  emailConsent: boolean
  marketingConsent: boolean
  ageConfirmed: boolean
}

type PlayerErrors = Partial<
  Record<'displayName' | 'email' | 'emailConsent' | 'ageConfirmed', MessageKey>
>

type Screen = 'loading' | 'invalid' | 'closed' | 'lookupFailed' | 'form' | 'sent'

// Contrôle de forme volontairement large : le serveur reste juge de l'adresse.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const locale = detectLocale()
const t = createTranslator(joinMessages, locale)

// Le jeton est dans le fragment : il ne part jamais dans une requête de page ni dans un journal.
const token = window.location.hash.slice(1)

const screen = ref<Screen>('loading')
const link = ref<JoinLookup | null>(null)
const emptyPlayer = (): PlayerDraft => ({
  displayName: '',
  email: '',
  emailConsent: false,
  marketingConsent: false,
  ageConfirmed: false,
})
const players = ref<PlayerDraft[]>([emptyPlayer()])
const errors = ref<PlayerErrors[]>([])
const failed = ref<JoinFailure['reason'] | null>(null)
const retryAfterSeconds = ref(0)
const sending = ref(false)

const FAILURE_MESSAGES: Record<JoinFailure['reason'], MessageKey> = {
  network: 'errorNetwork',
  full: 'errorFull',
  too_many_requests: 'errorTooMany',
  invalid_body: 'errorInvalidBody',
  server: 'errorServer',
  invalid: 'errorServer',
  closed: 'errorServer',
}

const submitError = computed(() =>
  failed.value ? t(FAILURE_MESSAGES[failed.value], { seconds: retryAfterSeconds.value }) : ''
)

document.documentElement.lang = locale
document.title = t('pageTitle')

async function load() {
  if (!token) {
    screen.value = 'invalid'
    return
  }

  screen.value = 'loading'

  const result = await lookupJoinLink(token)

  if (result.ok) {
    link.value = result.data
    screen.value = 'form'
  } else if (result.reason === 'invalid' || result.reason === 'closed') {
    screen.value = result.reason
  } else {
    screen.value = 'lookupFailed'
  }
}

function validate(player: PlayerDraft): PlayerErrors {
  const found: PlayerErrors = {}
  const email = player.email.trim()

  if (player.displayName.trim() === '') found.displayName = 'errorNameRequired'

  if (email !== '') {
    if (!EMAIL_PATTERN.test(email)) found.email = 'errorEmailInvalid'
    if (!player.emailConsent) found.emailConsent = 'errorEmailConsent'
    if (!player.ageConfirmed) found.ageConfirmed = 'errorAge'
  }

  return found
}

// Sans e-mail, les cases ne sont pas montrées : leurs valeurs ne partent pas.
function toInput(player: PlayerDraft): JoinPlayerInput {
  const email = player.email.trim()

  return {
    displayName: player.displayName.trim(),
    ...(email === ''
      ? {}
      : {
          email,
          emailConsent: player.emailConsent,
          marketingConsent: player.marketingConsent,
          ageConfirmed: player.ageConfirmed,
        }),
  }
}

// Préfixe de l'identifiant du champ de chaque erreur, dans l'ordre de la page.
const FIELD_IDS = {
  displayName: 'name',
  email: 'email',
  emailConsent: 'consent',
  ageConfirmed: 'age',
} as const

async function focusFirstError() {
  await nextTick()

  for (const [index, playerErrors] of errors.value.entries()) {
    for (const [key, id] of Object.entries(FIELD_IDS)) {
      if (playerErrors[key as keyof PlayerErrors]) {
        document.getElementById(`${id}-${index}`)?.focus()
        return
      }
    }
  }
}

async function submit() {
  // Une touche Entrée ou un double appui pendant l'envoi ne doit pas inscrire deux fois.
  if (sending.value) return

  failed.value = null
  errors.value = players.value.map(validate)

  if (errors.value.some((playerErrors) => Object.keys(playerErrors).length > 0)) {
    await focusFirstError()
    return
  }

  const [first, second] = players.value.map(toInput)

  sending.value = true

  const result = await sendJoinRegistration(token, {
    ...first!,
    ...(second ? { secondPlayer: second } : {}),
  })

  sending.value = false

  if (result.ok) {
    screen.value = 'sent'
  } else if (result.reason === 'invalid' || result.reason === 'closed') {
    // Le lien a été fermé ou régénéré pendant la saisie.
    screen.value = result.reason
  } else {
    failed.value = result.reason
    retryAfterSeconds.value = result.reason === 'too_many_requests' ? result.retryAfterSeconds : 0
  }
}

function restart() {
  players.value = [emptyPlayer()]
  errors.value = []
  failed.value = null
  screen.value = 'form'
}

onMounted(load)
</script>

<style>
/* La charte du backoffice verrouille le défilement (application plein écran) : une page de
   téléphone doit défiler. */
html,
body,
#app {
  height: auto;
  min-height: 100%;
}

body {
  overflow: auto;
}
</style>

<style scoped>
.join {
  max-width: 480px;
  margin: 0 auto;
  padding: 24px 16px 48px;
  display: grid;
  gap: 24px;
}

.join__head {
  display: flex;
  align-items: center;
  gap: 16px;
}

.join__logo {
  width: 56px;
  height: 56px;
  object-fit: contain;
}

.join__title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
}

.join__venue,
.join__hint {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--text-2);
}

.join__text {
  margin: 0;
  font-size: 16px;
  line-height: 1.5;
  color: var(--text-1);
}

.join__state {
  display: grid;
  gap: 16px;
}

.join__state h2 {
  margin: 0;
  font-size: 20px;
}

.join__form {
  display: grid;
  gap: 24px;
}

.join__player {
  display: grid;
  gap: 16px;
  margin: 0;
  padding: 16px 0 0;
  border: 0;
  border-top: 1px solid var(--border-2);
}

.join__legend {
  padding: 0;
  font-size: 18px;
  font-weight: 700;
}

.join__field {
  display: grid;
  gap: 4px;
}

.join__field label {
  font-size: 16px;
  font-weight: 600;
}

/* 16 px au moins : en dessous, Safari sur iPhone zoome la page à la saisie. */
.join__field input {
  min-height: 48px;
  padding: 0 14px;
  border: 1px solid var(--border-2);
  border-radius: var(--radius);
  background: var(--bg-field);
  color: var(--text-0);
  font: inherit;
  font-size: 16px;
}

.join__field input[aria-invalid='true'],
.join__check input[aria-invalid='true'] {
  border-color: var(--danger);
  outline: 1px solid var(--danger);
}

.join__field input:focus-visible,
.join__check input:focus-visible,
.join__notice summary:focus-visible,
.join__btn:focus-visible {
  outline: 2px solid var(--accent-pink);
  outline-offset: 2px;
}

.join__check {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-height: 48px;
}

.join__check input {
  flex: none;
  width: 24px;
  height: 24px;
  margin: 12px 0 0;
  accent-color: var(--accent-purple);
}

.join__check label {
  flex: 1;
  padding: 12px 0;
  font-size: 16px;
  line-height: 1.4;
  color: var(--text-1);
}

.join__error {
  margin: 0;
  font-size: 14px;
  color: var(--danger);
}

.join__error--box {
  padding: 12px 14px;
  border: 1px solid var(--danger);
  border-radius: var(--radius);
  background: var(--danger-bg);
  color: var(--text-0);
  font-size: 16px;
}

.join__notice summary {
  min-height: 48px;
  display: flex;
  align-items: center;
  cursor: pointer;
  font-size: 16px;
  color: var(--text-1);
}

.join__btn {
  width: 100%;
  min-height: 48px;
  font-size: 16px;
}

@media (prefers-reduced-motion: reduce) {
  .join * {
    transition: none;
  }
}
</style>
